require("dotenv").config({ quiet: true });

const express = require("express");
const twilio = require("twilio");

const { config } = require("./lib/config");
const { buildPromptBundle } = require("./lib/prompt-loader");
const { ConversationStore } = require("./lib/conversation-store");
const { createGroqService } = require("./lib/groq-service");
const { createChatService } = require("./lib/chat-service");

const app = express();
const promptBundle = buildPromptBundle();
const conversationStore = new ConversationStore(config.conversationStorePath);
const groqService = createGroqService(config);
const chatService = createChatService({
  config,
  groqService,
  conversationStore,
  promptBundle,
});

app.use(express.urlencoded({ extended: false }));

app.post("/webhook", async (req, res) => {
  const from = req.body.From || "unknown";
  const body = typeof req.body.Body === "string" ? req.body.Body.trim() : "";
  const hasMedia = Boolean(req.body.MediaContentType0);
  const type = hasMedia ? "media" : "text";

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

    twiml.message(reply);
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
