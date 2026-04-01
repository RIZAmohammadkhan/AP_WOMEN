require("dotenv").config({ quiet: true });

const express = require("express");
const twilio = require("twilio");

const { config } = require("./lib/config");
const { buildPromptBundle } = require("./lib/prompt-loader");
const { createSupabaseAdminClient } = require("./lib/supabase-client");
const { ConversationStore } = require("./lib/conversation-store");
const { createLangChainService } = require("./lib/langchain-service");
const { createChatService } = require("./lib/chat-service");
const { AudioStore } = require("./lib/audio-store");
const { ImageStore } = require("./lib/image-store");
const { createTwilioMediaService } = require("./lib/twilio-media-service");
const { createSarvamService } = require("./lib/sarvam-service");
const { createOutboundMessageService } = require("./lib/outbound-message-service");
const { createAudioResponseService } = require("./lib/audio-response-service");
const { createAudioInputService } = require("./lib/audio-input-service");
const { createImageInputService } = require("./lib/image-input-service");
const { createImageRetentionService } = require("./lib/image-retention-service");
const { isClearCommand } = require("./lib/clear-command");

const app = express();
const promptBundle = buildPromptBundle(config);
const { client: supabaseClient } = createSupabaseAdminClient(config);
const conversationStore = new ConversationStore({
  config,
  supabaseClient,
});
const llmService = createLangChainService(config);
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
const outboundMessageService = createOutboundMessageService({
  twilioClient: twilioRestClient,
});
const chatService = createChatService({
  config,
  llmService,
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

function collectImagePaths(messages) {
  return (messages || [])
    .map((message) => message?.imagePath)
    .filter((path) => typeof path === "string" && path);
}

async function buildReplyForIncomingMessage({
  from,
  body,
  hasMedia,
  isAudioMessage,
  isImageMessage,
  mediaUrl,
  mediaContentType,
}) {
  if (isClearCommand(body)) {
    if (!conversationStore.isConfigured) {
      return {
        status: "ok",
        text: "I'm not configured yet. Please add Supabase credentials and try again.",
        shouldSendAudio: false,
      };
    }

    const resetResult = await conversationStore.resetConversation(from);
    const imagePaths = collectImagePaths(resetResult.clearedConversation.messages);

    if (imageStore.isConfigured && imagePaths.length) {
      try {
        await imageStore.deleteImages(imagePaths);
      } catch (error) {
        console.error("Failed to delete cleared conversation images:", error);
      }
    }

    return {
      status: "ok",
      text: "Your chat history has been cleared. You can start a fresh conversation now.",
      shouldSendAudio: false,
    };
  }

  await imageRetentionService.cleanupConversation(from);

  let incomingMessage = {
    role: "user",
    text: body,
  };

  if (hasMedia && !isAudioMessage && !isImageMessage) {
    return {
      status: "ok",
      text: "Text, voice notes, and images are supported right now. Please send your message as text, audio, or image.",
      shouldSendAudio: false,
    };
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
    return {
      status: "ok",
      text: "Please send a text message, voice note, or image so I can help you.",
      shouldSendAudio: false,
    };
  }

  return chatService.respondToMessage({
    userId: from,
    message: incomingMessage,
  });
}

async function deliverReply({ reply, from, to, publicBaseUrl }) {
  if (reply.status === "stale_after_reset") {
    return;
  }

  await outboundMessageService.sendTextReply({
    text: reply.text,
    to: from,
    from: to,
  });

  if (reply.shouldSendAudio) {
    await audioResponseService.sendAudioReply({
      text: reply.text,
      to: from,
      from: to,
      publicBaseUrl,
    });
  }
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
    if (outboundMessageService.isConfigured && from !== "unknown" && to) {
      res.type("text/xml").send(twiml.toString());

      // When REST messaging is configured, answer the webhook immediately and do the
      // slower STT/LLM work in the background so Twilio does not time out the text reply.
      void (async () => {
        try {
          const reply = await buildReplyForIncomingMessage({
            from,
            body,
            hasMedia,
            isAudioMessage,
            isImageMessage,
            mediaUrl,
            mediaContentType,
          });

          await deliverReply({
            reply,
            from,
            to,
            publicBaseUrl,
          });
        } catch (error) {
          console.error("Async webhook reply failed:", error);

          const fallbackText =
            error.userMessage ||
            "I'm having trouble replying right now. Please try again in a moment.";

          await outboundMessageService
            .sendTextReply({
              text: fallbackText,
              to: from,
              from: to,
            })
            .catch((sendError) => {
              console.error("Async fallback text reply failed:", sendError);
            });
        }
      })();

      return;
    }

    const reply = await buildReplyForIncomingMessage({
      from,
      body,
      hasMedia,
      isAudioMessage,
      isImageMessage,
      mediaUrl,
      mediaContentType,
    });

    if (reply.status !== "stale_after_reset") {
      twiml.message(reply.text);
    }

    res.type("text/xml").send(twiml.toString());

    if (reply.status !== "stale_after_reset" && reply.shouldSendAudio) {
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
