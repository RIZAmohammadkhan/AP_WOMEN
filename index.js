require("dotenv").config({ quiet: true });

const express = require("express");
const twilio = require("twilio");

const { config } = require("./lib/config");
const { buildPromptBundle } = require("./lib/prompt-loader");
const { ConversationStore } = require("./lib/conversation-store");
const { createGroqService } = require("./lib/groq-service");
const { createChatService } = require("./lib/chat-service");
const { AudioStore } = require("./lib/audio-store");
const { createSarvamService } = require("./lib/sarvam-service");
const { createAudioResponseService } = require("./lib/audio-response-service");

const app = express();
const promptBundle = buildPromptBundle(config);
const conversationStore = new ConversationStore(config.conversationStorePath);
const groqService = createGroqService(config);
const sarvamService = createSarvamService(config);
const audioStore = new AudioStore(config.audioMediaTtlMs);
const twilioRestClient =
  config.twilioAccountSid && config.twilioAuthToken
    ? twilio(config.twilioAccountSid, config.twilioAuthToken)
    : null;
const chatService = createChatService({
  config,
  groqService,
  conversationStore,
  promptBundle,
});
const audioResponseService = createAudioResponseService({
  config,
  audioStore,
  sarvamService,
  twilioClient: twilioRestClient,
});

app.use(express.urlencoded({ extended: false }));

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
  const type = hasMedia ? "media" : "text";
  const publicBaseUrl = audioResponseService.resolvePublicBaseUrl(req);

  console.log(`Incoming message from ${from} [${type}]: ${body}`);

  const twiml = new twilio.twiml.MessagingResponse();

  if (hasMedia) {
    twiml.message("Text chat is supported right now. Please send your message as text.");
    return res.type("text/xml").send(twiml.toString());
  }

  if (!body) {
    twiml.message("Please send a text message so I can help you.");
    return res.type("text/xml").send(twiml.toString());
  }

  try {
    const reply = await chatService.respondToMessage({
      userId: from,
      text: body,
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
    twiml.message(
      "I'm having trouble replying right now. Please try again in a moment."
    );
  }

  return res.type("text/xml").send(twiml.toString());
});

app.listen(config.port, () => {
  console.log(`Meri Behen server running on port ${config.port}`);
});
