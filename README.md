# Meri Behen

Meri Behen is a WhatsApp-first AI assistant designed for women-led Self-Help Groups in Andhra Pradesh. The idea is simple: meet users inside a tool they already use, let them ask in their own language through text, voice notes, or images, and return clear next steps without making them learn a new app.

This repository contains the current backend webhook service. It receives inbound WhatsApp messages from Twilio, stores conversation state in Supabase, uses LangChain to route chat and image-aware responses to the configured LLM provider, uses Sarvam for speech-to-text and text-to-speech, and sends replies back over WhatsApp.

## Why This Project Exists

Many SHGs already produce valuable products such as pickles, handicrafts, textiles, and household goods. The harder problem is not only production but access:

- market information is fragmented
- buyer discovery is difficult
- scheme and onboarding flows are hard to understand
- most digital tools assume English fluency and higher digital confidence

Meri Behen is meant to reduce that friction by turning WhatsApp into a conversational business guide. The long-term product direction lives in [prompt/idea.md](./prompt/idea.md) and the conceptual tool contracts live in [prompt/tools.md](./prompt/tools.md).

## What The App Does Today

- Accepts inbound WhatsApp text messages
- Accepts inbound WhatsApp voice notes
- Transcribes voice notes with Sarvam Speech-to-Text
- Detects transcript language with Sarvam text language detection
- Accepts inbound WhatsApp images
- Stores inbound images in Supabase Storage
- Lets the AI answer questions about a recent image in later turns
- Stores conversation state in Supabase Postgres
- Summarizes older conversation turns to stay within context limits
- Uses LangChain to call the configured text model for normal chat replies
- Uses the configured vision model when image context is present
- Optionally sends outbound voice-note replies using Sarvam TTS
- Supports `/clear` and `@clear` to reset a user conversation
- Cleans up stored images after the retention window

## What Is Not Implemented Yet

- real business data tools from [prompt/tools.md](./prompt/tools.md)
- broader test coverage
- production deployment packaging
- background job infrastructure outside the app process
- analytics, tracing, and admin tooling

## Current Product Behavior

The assistant is currently a conversational multimodal backend. It is already useful as a WhatsApp-native interface layer, but it is not yet connected to live market, buyer, scheme, or platform systems. Right now the AI can understand:

- plain text
- audio that can be transcribed into text
- images that stay inside the recent conversation window

If an image falls out of the recent-message window and gets summarized, the raw image is removed and only the summary remains.

## Tech Stack

- Node.js 18+
- Express
- Twilio WhatsApp webhooks and Twilio REST API
- LangChain chat models
- Supabase Postgres
- Supabase Storage
- Sarvam Speech-to-Text
- Sarvam Text-to-Speech

## High-Level Architecture

1. Twilio sends an inbound WhatsApp webhook to `POST /webhook`.
2. The app reads `From`, `Body`, and media metadata from the webhook payload.
3. If the message is audio, the app downloads the media from Twilio and sends it to Sarvam STT.
4. If the message is an image, the app downloads it from Twilio and uploads it to Supabase Storage.
5. The conversation is loaded from Supabase.
6. The app builds a chat payload for LangChain:
   - text-only model for normal turns
   - vision model when recent messages include images
7. The selected provider returns the assistant response.
8. The text reply is sent back immediately as TwiML.
9. If audio output is enabled, the app generates speech with Sarvam and sends voice-note media through the Twilio REST API.
10. A retention worker periodically deletes expired images from Supabase Storage and removes stale image references from conversations.

## Repository Structure

```text
.
|-- index.js
|-- lib/
|   |-- config.js
|   |-- llm-provider-config.js
|   |-- prompt-loader.js
|   |-- langchain-service.js
|   |-- chat-service.js
|   |-- conversation-store.js
|   |-- supabase-client.js
|   |-- twilio-media-service.js
|   |-- image-store.js
|   |-- image-input-service.js
|   |-- image-retention-service.js
|   |-- sarvam-service.js
|   |-- audio-input-service.js
|   |-- audio-response-service.js
|   |-- audio-store.js
|   |-- language.js
|-- supabase/
|   |-- schema.sql
|-- prompt/
|   |-- idea.md
|   |-- tools.md
|-- .env.example
|-- package.json
```

## Prerequisites

- Node.js 18 or newer
- npm
- a Twilio account with WhatsApp enabled
- one provider API key for Groq, OpenAI, Anthropic, or Gemini
- a Supabase project
- a public HTTPS URL for Twilio webhook testing, such as ngrok

Optional:

- a Sarvam API key for audio input and audio output
- Twilio Account SID and Auth Token for outbound media sends

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create the environment file

```bash
cp .env.example .env
```

### 3. Configure Supabase

In Supabase SQL Editor, run [supabase/schema.sql](./supabase/schema.sql):

```sql
create table if not exists public.conversations (
  user_id text primary key,
  summary text not null default '',
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.conversations
  add column if not exists session_version bigint not null default 0;

alter table public.conversations enable row level security;

create index if not exists conversations_updated_at_idx
  on public.conversations (updated_at desc);
```

Notes:

- the app expects the table in `public`
- the default table name is `conversations`
- the app will try to create the storage bucket automatically if it does not exist and the service-role key has permission

### 4. Fill in `.env`

At minimum, provide:

```env
PORT=3000
LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key
GROQ_TEXT_MODEL=openai/gpt-oss-120b
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

For audio input and audio output, also provide:

```env
SARVAM_API_KEY=your_sarvam_api_key
ENABLE_AUDIO_INPUT=true
ENABLE_AUDIO_OUTPUT=true
```

For outbound audio replies, you also need:

```env
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
PUBLIC_BASE_URL=https://your-public-domain.example
```

To switch providers, keep the same app code and change only env:

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key
OPENAI_TEXT_MODEL=gpt-5.4
OPENAI_VISION_MODEL=gpt-5.4
OPENAI_SUMMARY_MODEL=gpt-5.4
```

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_TEXT_MODEL=claude-opus-4-1-20250805
ANTHROPIC_VISION_MODEL=claude-opus-4-1-20250805
ANTHROPIC_SUMMARY_MODEL=claude-opus-4-1-20250805
```

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_TEXT_MODEL=gemini-2.5-pro
GEMINI_VISION_MODEL=gemini-2.5-pro
GEMINI_SUMMARY_MODEL=gemini-2.5-pro
```

These defaults were chosen against official docs checked on March 31, 2026:

- OpenAI: `gpt-5.4` is the current flagship in the API changelog
- Anthropic: `claude-opus-4-1-20250805` is the latest stable Opus snapshot shown in the models overview
- Google: `gemini-2.5-pro` is the current stable advanced Gemini model; Gemini 3.1 Pro is newer but still preview

### 5. Start the server

```bash
npm start
```

For development with autoreload:

```bash
npm run dev
```

By default the app listens on port `3000`.

## Twilio Setup

1. Start the app locally.
2. Expose it with a public tunnel:

```bash
ngrok http 3000
```

3. In Twilio, set the incoming WhatsApp webhook URL to:

```text
https://your-public-url/webhook
```

Twilio sends webhook payloads as `application/x-www-form-urlencoded`, which is what this app expects.

Important behavior:

- there is no special Twilio slash-command registration for this app
- `/clear` and `@clear` are handled by checking the incoming `Body` text in the webhook

## Environment Variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | No | `3000` | Express server port |
| `LLM_PROVIDER` | No | `groq` | Active LangChain provider: `groq`, `openai`, `anthropic`, or `gemini` |
| `GROQ_TEXT_MODEL` | No | `openai/gpt-oss-120b` | Groq text model |
| `GROQ_VISION_MODEL` | No | `meta-llama/llama-4-scout-17b-16e-instruct` | Groq vision model |
| `GROQ_SUMMARY_MODEL` | No | `openai/gpt-oss-120b` | Groq summary model |
| `LLM_MAX_OUTPUT_TOKENS` | No | `700` | Max output tokens passed to the selected chat model |
| `GROQ_API_KEY` | Required when `LLM_PROVIDER=groq` | - | Groq API key |
| `OPENAI_API_KEY` | Required when `LLM_PROVIDER=openai` | - | OpenAI API key |
| `OPENAI_TEXT_MODEL` | No | `gpt-5.4` | OpenAI text model |
| `OPENAI_VISION_MODEL` | No | `gpt-5.4` | OpenAI vision model |
| `OPENAI_SUMMARY_MODEL` | No | `gpt-5.4` | OpenAI summary model |
| `ANTHROPIC_API_KEY` | Required when `LLM_PROVIDER=anthropic` | - | Anthropic API key |
| `ANTHROPIC_TEXT_MODEL` | No | `claude-opus-4-1-20250805` | Anthropic text model |
| `ANTHROPIC_VISION_MODEL` | No | `claude-opus-4-1-20250805` | Anthropic vision model |
| `ANTHROPIC_SUMMARY_MODEL` | No | `claude-opus-4-1-20250805` | Anthropic summary model |
| `GEMINI_API_KEY` or `GOOGLE_API_KEY` | Required when `LLM_PROVIDER=gemini` | - | Gemini API key |
| `GEMINI_TEXT_MODEL` | No | `gemini-2.5-pro` | Gemini text model |
| `GEMINI_VISION_MODEL` | No | `gemini-2.5-pro` | Gemini vision model |
| `GEMINI_SUMMARY_MODEL` | No | `gemini-2.5-pro` | Gemini summary model |
| `SYSTEM_PROMPT` | No | built-in fallback | Base assistant instruction seed |
| `SUPABASE_URL` | Yes | - | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | - | Service-role key used by the server |
| `SUPABASE_CONVERSATIONS_TABLE` | No | `conversations` | Conversation table name |
| `SUPABASE_IMAGE_BUCKET` | No | `conversation-images` | Supabase Storage bucket for inbound images |
| `SUPABASE_SIGNED_IMAGE_URL_TTL_SECONDS` | No | `3600` | Signed URL lifetime for model image access |
| `SUPABASE_IMAGE_RETENTION_DAYS` | No | `7` | Image retention window before cleanup |
| `IMAGE_CLEANUP_INTERVAL_MS` | No | `3600000` | How often the cleanup worker runs |
| `MAX_RECENT_MESSAGES` | No | `12` | Recent message window before summarization |
| `MAX_CONTEXT_CHARS` | No | `6000` | Approximate context limit before summarization |
| `ENABLE_AUDIO_INPUT` | No | `false` | Enables inbound voice-note transcription |
| `ENABLE_AUDIO_OUTPUT` | No | `false` | Enables outbound voice-note replies |
| `PUBLIC_BASE_URL` | Recommended for audio output | empty | Public base URL for Twilio media fetches |
| `TWILIO_ACCOUNT_SID` | Recommended, required for outbound media sends | empty | Twilio REST credential |
| `TWILIO_AUTH_TOKEN` | Recommended, required for outbound media sends | empty | Twilio REST credential |
| `TWILIO_WHATSAPP_FROM` | Recommended | empty | WhatsApp sender number |
| `SARVAM_API_KEY` | Required for audio features | empty | Sarvam API key |
| `SARVAM_STT_MODEL` | No | `saaras:v3` | Sarvam speech-to-text model |
| `SARVAM_TTS_MODEL` | No | `bulbul:v3` | Sarvam text-to-speech model |
| `SARVAM_TTS_SPEAKER` | No | `shreya` | Sarvam speaker voice |
| `SARVAM_OUTPUT_AUDIO_CODEC` | No | `opus` | Audio codec for generated speech |
| `SARVAM_SPEECH_SAMPLE_RATE` | No | `24000` | Sample rate sent to Sarvam TTS |
| `SARVAM_TTS_PACE` | No | `1` | Sarvam TTS pace |
| `AUDIO_MEDIA_TTL_MS` | No | `600000` | In-memory TTL for generated outbound audio assets |

Provider note:

- the LLM layer now runs through LangChain so later tool binding can happen without replacing the chat service again
- if `LLM_PROVIDER=groq` and `GROQ_VISION_MODEL` is a known text-only Groq model, the app falls back to `meta-llama/llama-4-scout-17b-16e-instruct` and logs a warning
- when `LLM_PROVIDER=gemini`, image URLs are converted to base64 data URLs before the LangChain call because the Google adapter expects inline image data

## Supported Inputs

### Text

Plain text messages are sent directly into the LangChain chat flow for the selected provider.

### Audio

When `ENABLE_AUDIO_INPUT=true`:

- Twilio media is downloaded
- audio is sent to Sarvam STT
- transcript language is detected with Sarvam text language detection
- the resulting text is treated like a normal user message

### Images

When the incoming message is an image:

- Twilio media is downloaded
- the image is uploaded to Supabase Storage
- the image path is stored in conversation history
- fresh signed URLs are generated for recent image messages when the selected model needs to reason over them

This lets users ask follow-up questions about a recent image in later turns.

## Supported Commands

- `/clear`
- `@clear`

These commands reset the active chat session by:

- clearing the stored summary and recent messages
- incrementing the conversation `session_version`
- the currently tracked image files for that conversation

The reset is durable, so older in-flight replies cannot restore pre-clear history. The reply confirms the reset so the user can start over with a clean chat.

## Image Retention

Inbound images do not stay forever.

They are removed in three cases:

- the user sends `/clear` or `@clear`
- image-bearing messages are summarized out of the recent window
- the retention worker sees an image older than `SUPABASE_IMAGE_RETENTION_DAYS`

The retention worker runs inside the app process on an interval controlled by `IMAGE_CLEANUP_INTERVAL_MS`.

Practical note:

- if the app is not running, cleanup waits until the next process start or the next scheduled pass

## Outbound Audio Replies

When `ENABLE_AUDIO_OUTPUT=true`, the app can send an additional WhatsApp voice-note-style reply after the text response.

The flow is:

- detect a Sarvam-compatible language code from the reply text
- split long replies into chunks
- synthesize each chunk with Sarvam TTS
- expose the generated audio temporarily through `/media/:token.:extension`
- ask Twilio to send those media URLs to the user

The text reply still goes out first. Audio is best-effort and is skipped if any prerequisite is missing.

## Local Smoke Testing

You can simulate a plain text Twilio webhook with:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "From=whatsapp:+911111111111" \
  --data-urlencode "To=whatsapp:+14155238886" \
  --data-urlencode "Body=Hello"
```

You can simulate the clear command with:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "From=whatsapp:+911111111111" \
  --data-urlencode "Body=/clear"
```

For real media testing, use Twilio WhatsApp directly because media URLs and auth behavior are part of the live webhook flow.

## Troubleshooting

### The assistant says it is not configured

Check all of:

- `LLM_PROVIDER`
- the provider-specific model envs for the selected provider, such as `OPENAI_TEXT_MODEL` or `GEMINI_TEXT_MODEL`
- the matching provider API key for the selected provider

### `Could not find the table 'public.conversations' in the schema cache`

Run [supabase/schema.sql](./supabase/schema.sql) in Supabase SQL Editor, then restart the app.

### Audio input says it is not enabled

Set:

```env
ENABLE_AUDIO_INPUT=true
SARVAM_API_KEY=...
```

### Audio output is skipped

Check all of:

- `ENABLE_AUDIO_OUTPUT=true`
- `SARVAM_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `PUBLIC_BASE_URL`

### Image support says it is not configured

Check all of:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_IMAGE_BUCKET`

### Voice-note or image download fails

Twilio media fetches may require valid Twilio credentials. Make sure `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are correct.

## Development Notes

- basic automated tests run with `npm test`
- the retention worker is process-local, not a separate scheduler
- the system prompt is assembled in [lib/prompt-loader.js](./lib/prompt-loader.js)
- provider selection and LangChain model setup live in [lib/langchain-service.js](./lib/langchain-service.js)
- conversation compaction and multimodal prompt building live in [lib/chat-service.js](./lib/chat-service.js)
- Supabase persistence lives in [lib/conversation-store.js](./lib/conversation-store.js)
- image retention logic lives in [lib/image-retention-service.js](./lib/image-retention-service.js)

## Scripts

```bash
npm start
npm run dev
```
