require("dotenv").config({ quiet: true });

const express = require("express");
const twilio = require("twilio");

const { config } = require("./lib/config");
const { buildPromptBundle } = require("./lib/prompt-loader");
const { createSupabaseAdminClient } = require("./lib/supabase-client");
const { ConversationStore } = require("./lib/conversation-store");
const { createGroqService } = require("./lib/groq-service");
const { createChatService } = require("./lib/chat-service");
const { AudioStore } = require("./lib/audio-store");
const { ImageStore } = require("./lib/image-store");
const { createTwilioMediaService } = require("./lib/twilio-media-service");
const { createSarvamService } = require("./lib/sarvam-service");
const { createAudioResponseService } = require("./lib/audio-response-service");
const { createAudioInputService } = require("./lib/audio-input-service");
const { createImageInputService } = require("./lib/image-input-service");
const { createImageRetentionService } = require("./lib/image-retention-service");

const app = express();
const promptBundle = buildPromptBundle(config);
const { client: supabaseClient } = createSupabaseAdminClient(config);
const conversationStore = new ConversationStore({
  config,
  supabaseClient,
});
const groqService = createGroqService(config);
const sarvamService = createSarvamService(config);
const audioStore = new AudioStore(config.audioMediaTtlMs);
const imageStore = new ImageStore({
  config,
  supabaseClient,
});
const twilioMediaService = createTwilioMediaService({ config });
const twilioRestClient =
  config.twilioAccountSid && config.twilioAuthToken
    ? twilio(config.twilioAccountSid, config.twilioAuthToken)
    : null;
const chatService = createChatService({
  config,
  groqService,
  conversationStore,
  promptBundle,
  imageStore,
});
const audioResponseService = createAudioResponseService({
  config,
  audioStore,
  sarvamService,
  twilioClient: twilioRestClient,
});
const audioInputService = createAudioInputService({
  config,
  sarvamService,
  twilioMediaService,
});
const imageInputService = createImageInputService({
  twilioMediaService,
  imageStore,
});
const imageRetentionService = createImageRetentionService({
  config,
  conversationStore,
  imageStore,
});

app.use(express.urlencoded({ extended: false }));

function isClearCommand(text) {
  const normalized = String(text || "").trim().toLowerCase();
  return normalized === "/clear" || normalized === "@clear";
}

function collectImagePaths(messages) {
  return (messages || [])
    .map((message) => message?.imagePath)
    .filter((path) => typeof path === "string" && path);
}

function handleAudioFetch(req, res) {
  const asset = audioStore.get(req.params.token);

  if (!asset) {
    console.warn(`Audio fetch missed for token=${req.params.token}`);
    return res.status(404).send("Audio not found.");
  }

  console.log(
    `Serving audio asset token=${req.params.token} type=${asset.contentType} bytes=${asset.buffer.length}`
  );

  res.set("Content-Type", asset.contentType);
  res.set(
    "Content-Disposition",
    `inline; filename="reply.${asset.extension}"`
  );

  if (req.method === "HEAD") {
    return res.status(200).end();
  }

  return res.status(200).send(asset.buffer);
}

app.head("/media/:token.:extension", handleAudioFetch);
app.get("/media/:token.:extension", handleAudioFetch);

app.post("/webhook", async (req, res) => {
  const from = req.body.From || "unknown";
  const to = req.body.To || config.twilioWhatsAppFrom || "";
  const body = typeof req.body.Body === "string" ? req.body.Body.trim() : "";
  const hasMedia = Boolean(req.body.MediaContentType0);
  const mediaContentType = req.body.MediaContentType0 || "";
  const mediaUrl = req.body.MediaUrl0 || "";
  const isAudioMessage =
    hasMedia && audioInputService.isSupportedAudioContentType(mediaContentType);
  const isImageMessage =
    hasMedia && imageInputService.isSupportedImageContentType(mediaContentType);
  const type = isAudioMessage
    ? "audio"
    : isImageMessage
      ? "image"
      : hasMedia
        ? "media"
        : "text";
  const publicBaseUrl = audioResponseService.resolvePublicBaseUrl(req);

  console.log(`Incoming message from ${from} [${type}]: ${body}`);

  const twiml = new twilio.twiml.MessagingResponse();

  try {
    if (isClearCommand(body)) {
      if (!conversationStore.isConfigured) {
        twiml.message(
          "I'm not configured yet. Please add Supabase credentials and try again."
        );
        return res.type("text/xml").send(twiml.toString());
      }

      const clearedConversation = await conversationStore.clearConversation(from);
      const imagePaths = collectImagePaths(clearedConversation.messages);

      if (imageStore.isConfigured && imagePaths.length) {
        try {
          await imageStore.deleteImages(imagePaths);
        } catch (error) {
          console.error("Failed to delete cleared conversation images:", error);
        }
      }

      twiml.message(
        "Your chat history has been cleared. You can start a fresh conversation now."
      );
      return res.type("text/xml").send(twiml.toString());
    }

    await imageRetentionService.cleanupConversation(from);

    let incomingMessage = {
      role: "user",
      text: body,
    };

    if (hasMedia && !isAudioMessage && !isImageMessage) {
      twiml.message(
        "Text, voice notes, and images are supported right now. Please send your message as text, audio, or image."
      );
      return res.type("text/xml").send(twiml.toString());
    }

    if (isAudioMessage) {
      const transcription = await audioInputService.transcribeIncomingAudio({
        mediaUrl,
        mediaContentType,
      });

      incomingMessage = {
        role: "user",
        text: [body, transcription.text].filter(Boolean).join("\n").trim(),
      };
    }

    if (isImageMessage) {
      const imageMessage = await imageInputService.processIncomingImage({
        userId: from,
        mediaUrl,
        mediaContentType,
        text: body,
      });

      incomingMessage = {
        role: "user",
        text: imageMessage.text,
        imagePath: imageMessage.imagePath,
        imageStoredAt: imageMessage.imageStoredAt,
      };
    }

    if (!incomingMessage.text && !incomingMessage.imagePath) {
      twiml.message(
        "Please send a text message, voice note, or image so I can help you."
      );
      return res.type("text/xml").send(twiml.toString());
    }

    const reply = await chatService.respondToMessage({
      userId: from,
      message: incomingMessage,
    });

    twiml.message(reply.text);
    res.type("text/xml").send(twiml.toString());

    if (reply.shouldSendAudio) {
      void audioResponseService
        .sendAudioReply({
          text: reply.text,
          to: from,
          from: to,
          publicBaseUrl,
        })
        .catch((error) => {
          console.error("Audio reply failed:", error);
        });
    }

    return;
  } catch (error) {
    console.error("Webhook reply failed:", error);
    if (error.userMessage) {
      twiml.message(error.userMessage);
      return res.type("text/xml").send(twiml.toString());
    }

    twiml.message(
      "I'm having trouble replying right now. Please try again in a moment."
    );
  }

  return res.type("text/xml").send(twiml.toString());
});

app.listen(config.port, () => {
  console.log(`Meri Behen server running on port ${config.port}`);
});

imageRetentionService.start();
void imageRetentionService.runCleanupPass();
