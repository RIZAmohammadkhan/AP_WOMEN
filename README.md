# Meri Behen

Meri Behen is a WhatsApp-first assistant for women-led Self-Help Groups in Andhra Pradesh. This repository contains the current Node.js webhook service that receives WhatsApp messages from Twilio, generates text replies with Groq, stores conversation history in Supabase, can transcribe incoming voice notes with Sarvam STT, can answer questions about WhatsApp images with Groq vision models, and can optionally send audio replies using Sarvam TTS.

The current codebase is an MVP backend for that larger product idea. The broader product direction lives in [`prompts/idea.md`](./prompts/idea.md) and the planned business-tool contracts live in [`prompts/tools.md`](./prompts/tools.md).

## What The App Does Today

- Receives inbound WhatsApp webhook requests from Twilio
- Accepts text messages and returns a text response as TwiML
- Accepts WhatsApp voice notes, transcribes them with Sarvam, and routes the transcript through the same chat flow
- Accepts WhatsApp images, stores them in Supabase Storage, and includes recent images in later AI turns
- Supports `/clear` and `@clear` commands to wipe a user's stored conversation and image context
- Stores per-user conversation history in Supabase Postgres
- Summarizes older conversation turns to keep prompt size under control
- Uses Groq for both chat replies and conversation summarization
- Can optionally generate voice-note replies with Sarvam TTS
- Serves temporary audio media files that Twilio can fetch for WhatsApp media messages

## What Is Not Implemented Yet

- Live business tools from `prompts/tools.md`
- Automated tests
- Production deployment configuration

One important current limitation: only text, audio, and images are supported. If a user sends any other media type, the webhook responds with a fallback asking for supported input types.

## Tech Stack

- Node.js + Express
- Twilio WhatsApp webhook + Twilio REST API
- Groq chat completions
- Supabase Postgres + Storage
- Sarvam text-to-speech

## Project Structure

```text
.
|-- index.js                     # Express app and Twilio webhook routes
|-- lib/
|   |-- config.js               # Environment parsing and defaults
|   |-- chat-service.js         # Chat flow + conversation compaction
|   |-- groq-service.js         # Groq API wrapper
|   |-- conversation-store.js   # Supabase conversation persistence
|   |-- audio-response-service.js
|   |-- sarvam-service.js
|   |-- audio-store.js
|   |-- image-store.js
|   |-- image-input-service.js
|   |-- supabase-client.js
|   |-- twilio-media-service.js
|   |-- language.js             # Script-based language detection for TTS
|-- supabase/
|   |-- schema.sql              # Conversation table setup
|-- prompts/
|   |-- idea.md                 # Product vision
|   |-- tools.md                # Planned tool contracts
|-- .env.example
```

## Prerequisites

- Node.js 18 or newer
- npm
- A Twilio account with WhatsApp enabled
- A Groq API key
- A Supabase project
- A public HTTPS URL for webhook testing, such as ngrok

Optional for audio replies:

- Sarvam API key
- Twilio Account SID and Auth Token for sending outbound media messages

Node 18+ is recommended because the Sarvam integration uses the built-in `fetch` API.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your environment file:

   ```bash
   cp .env.example .env
   ```

3. Fill in the required values in `.env`.

4. Start the server:

   ```bash
   npm start
   ```

   For local development with auto-reload:

   ```bash
   npm run dev
   ```

By default, the server listens on port `3000`.

## Environment Variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | No | `3000` | Express server port |
| `GROQ_API_KEY` | Yes | - | Enables chat replies and summarization |
| `GROQ_CHAT_MODEL` | No | `openai/gpt-oss-20b` | Model used for text-only replies |
| `GROQ_VISION_MODEL` | No | `meta-llama/llama-4-scout-17b-16e-instruct` | Model used when recent messages include an image |
| `SUMMARY_MODEL` | No | same as `GROQ_CHAT_MODEL` | Model used for history summarization |
| `SYSTEM_PROMPT` | No | built-in fallback | Base assistant persona and instruction seed |
| `SUPABASE_URL` | Yes | - | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | - | Server-side Supabase key used for database and storage access |
| `SUPABASE_CONVERSATIONS_TABLE` | No | `conversations` | Table used for conversation rows |
| `SUPABASE_IMAGE_BUCKET` | No | `conversation-images` | Bucket used to store inbound WhatsApp images |
| `SUPABASE_SIGNED_IMAGE_URL_TTL_SECONDS` | No | `3600` | Signed URL lifetime used when the model needs to read a stored image |
| `SUPABASE_IMAGE_RETENTION_DAYS` | No | `7` | How long inbound images stay in Supabase Storage before cleanup |
| `IMAGE_CLEANUP_INTERVAL_MS` | No | `3600000` | How often the app scans for expired image files to delete |
| `MAX_RECENT_MESSAGES` | No | `12` | Max recent messages to keep before compaction |
| `MAX_CONTEXT_CHARS` | No | `6000` | Approximate context-size limit before summarization |
| `ENABLE_AUDIO_INPUT` | No | `false` | Enables incoming voice-note transcription |
| `ENABLE_AUDIO_OUTPUT` | No | `false` | Enables async voice-note replies |
| `PUBLIC_BASE_URL` | Recommended for audio | empty | Public base URL used for Twilio media fetches |
| `TWILIO_ACCOUNT_SID` | Recommended, required for audio sends | empty | Twilio REST client credential |
| `TWILIO_AUTH_TOKEN` | Recommended, required for audio sends | empty | Twilio REST client credential |
| `TWILIO_WHATSAPP_FROM` | Recommended | empty | WhatsApp sender number, for example `whatsapp:+14155238886` |
| `SARVAM_API_KEY` | Required only for audio | empty | Sarvam TTS API key |
| `SARVAM_STT_MODEL` | No | `saaras:v3` | Sarvam speech-to-text model |
| `SARVAM_TTS_MODEL` | No | `bulbul:v3` | Sarvam TTS model |
| `SARVAM_TTS_SPEAKER` | No | `shreya` | Sarvam voice |
| `SARVAM_OUTPUT_AUDIO_CODEC` | No | `opus` | Output codec for generated audio |
| `SARVAM_SPEECH_SAMPLE_RATE` | No | `24000` | Sample rate sent to Sarvam |
| `SARVAM_TTS_PACE` | No | `1` | Speech pace for TTS |
| `AUDIO_MEDIA_TTL_MS` | No | `600000` | How long generated audio stays available in memory |

## Running With Twilio

1. Start the app locally:

   ```bash
   npm run dev
   ```

2. Expose it with a public HTTPS tunnel:

   ```bash
   ngrok http 3000
   ```

3. In Twilio, configure the incoming WhatsApp webhook to:

   ```text
   https://your-public-url/webhook
   ```

4. Send a WhatsApp message to your Twilio sender or sandbox number.

Twilio sends webhook requests as `application/x-www-form-urlencoded`, which is what this app expects.

Twilio does not provide a separate slash-command mechanism for this webhook flow. Commands such as `/clear` or `@clear` are handled by checking the incoming `Body` text in the webhook request.

Before running the app against Supabase:

1. Set `SUPABASE_IMAGE_BUCKET` to the bucket you want to use. The app will try to create that private bucket automatically with the service-role key if it does not exist yet.
2. Run the SQL in `supabase/schema.sql` in your Supabase SQL editor.

## Local Smoke Test Without Twilio

You can simulate a Twilio webhook call with:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "From=whatsapp:+911111111111" \
  --data-urlencode "To=whatsapp:+14155238886" \
  --data-urlencode "Body=Hello"
```

The response should be TwiML XML containing the assistant reply.

## How The Request Flow Works

1. Twilio sends an inbound WhatsApp message to `POST /webhook`.
2. The app reads the sender ID from `From`.
3. If the message is a voice note and audio input is enabled, the app downloads the media from Twilio, transcribes it with Sarvam STT, runs Sarvam text language detection on the transcript, and uses the transcript as the user message.
4. If the message is an image, the app downloads it from Twilio, uploads it to Supabase Storage, and stores the bucket path with the user message.
5. If the user sends `/clear` or `@clear`, the app deletes that user's conversation row and deletes any currently tracked images for that conversation.
6. Existing conversation state is loaded from Supabase.
7. If any recent user message contains an image, the app generates fresh signed URLs and sends those images back to the vision-capable Groq model together with the recent text turns.
8. Older history may be summarized if the conversation gets too long.
9. Groq generates the assistant reply.
10. The text reply is returned immediately to Twilio as TwiML.
11. If audio replies are enabled, the app asynchronously generates TTS audio and sends one or more WhatsApp media messages through the Twilio REST API.

The audio path is separate from the text response. Users receive the text reply first, and the audio message follows afterward if all audio prerequisites are configured correctly.

## Audio Input Behavior

When `ENABLE_AUDIO_INPUT=true`, the app:

- Accepts inbound WhatsApp audio media
- Downloads the media from Twilio
- Sends the audio to Sarvam Speech-to-Text
- Calls Sarvam language detection on the transcript
- Proceeds through the normal chat flow with the transcribed text

If transcription fails, the user receives a short fallback asking her to retry or send text.

## Image Input Behavior

When a user sends an image:

- The app downloads the image from Twilio
- Uploads it to Supabase Storage
- Stores the image path in the conversation record
- Uses a Groq vision model when the current or recent messages contain images
- Rehydrates recent images as signed URLs so the user can ask follow-up questions about them in later turns
- Deletes expired images after the retention window, which defaults to 7 days

If an image falls out of the recent-message window and is summarized away, the model keeps only the summary text, not the raw image itself.

## Audio Reply Behavior

When `ENABLE_AUDIO_OUTPUT=true`, the app:

- Detects a language code from the reply text
- Splits long responses into chunks
- Sends each chunk to Sarvam for speech synthesis
- Stores the generated audio in an in-memory tokenized store
- Exposes each file through `GET /media/:token.:extension`
- Sends those media URLs back to the user via Twilio

Current TTS language detection is script-based and supports:

- English written in Latin script
- Telugu
- Tamil
- Kannada
- Malayalam
- Gujarati
- Bengali
- Punjabi
- Odia
- Hindi

If the reply language cannot be mapped, audio is skipped and the text reply still succeeds.

## Data Storage

Conversation history is stored in Supabase Postgres. Each user record contains:

- `summary`: compacted history used for long-running conversations
- `messages`: recent user and assistant turns, including image paths for recent user image messages
- `updatedAt`: last write timestamp

Inbound images are stored in Supabase Storage. Generated audio is not written to disk. It is stored in memory and expires after `AUDIO_MEDIA_TTL_MS`. Restarting the process clears all pending audio assets.

Stored images are cleaned up in three situations:

- When the user sends `/clear` or `@clear`
- When image-bearing messages are summarized out of the recent-message window
- When the image retention worker sees that an image is older than `SUPABASE_IMAGE_RETENTION_DAYS`

## Operational Notes

- If `GROQ_API_KEY` is missing or invalid, the app returns a configuration message instead of a model response.
- If Supabase is not configured, conversation persistence and image support will fail until `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.
- If audio is enabled but `PUBLIC_BASE_URL` is missing, the app logs why audio was skipped.
- If Twilio REST credentials are missing, text replies still work through webhook TwiML, but async audio sends will be skipped.
- If users send unsupported media, the app returns a text-only fallback.
- If the app is not running, expired images will not be cleaned up until the next cleanup pass after it starts again.

## Development Notes

- The app now depends on Supabase for conversation persistence and inbound image storage.
- The conceptual product docs in `prompts/` describe a larger assistant than what is implemented in code right now.
- There is currently no test suite in the repository, so manual smoke testing is the main verification path.

## Scripts

```bash
npm start     # start the server
npm run dev   # start with nodemon
```
