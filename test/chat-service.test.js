const test = require("node:test");
const assert = require("node:assert/strict");

const {
  TURN_MODES,
  classifyTurn,
  createChatService,
} = require("../lib/chat-service");

test("classifyTurn recognizes greeting or re-entry", () => {
  const turnMode = classifyTurn(
    { summary: "", messages: [] },
    { role: "user", text: "Hello" }
  );

  assert.equal(turnMode, TURN_MODES.GREETING_OR_REENTRY);
});

test("classifyTurn recognizes clarification-needed turns", () => {
  const turnMode = classifyTurn(
    { summary: "", messages: [] },
    { role: "user", text: "I want to sell" }
  );

  assert.equal(turnMode, TURN_MODES.CLARIFICATION_NEEDED);
});

test("classifyTurn recognizes direct-answer turns", () => {
  const turnMode = classifyTurn(
    { summary: "", messages: [] },
    { role: "user", text: "How can I sell homemade mango pickle in Vijayawada?" }
  );

  assert.equal(turnMode, TURN_MODES.DIRECT_ANSWER);
});

test("classifyTurn recognizes image follow-ups", () => {
  const turnMode = classifyTurn(
    {
      summary: "",
      messages: [{ role: "user", text: "Here is my product", imagePath: "path/a.jpg" }],
    },
    { role: "user", text: "Can you describe this image?" }
  );

  assert.equal(turnMode, TURN_MODES.IMAGE_FOLLOW_UP);
});

test("respondToMessage suppresses stale replies after reset", async () => {
  const llmService = {
    isConfigured: true,
    configurationMessage: "Missing config",
    async chat() {
      return "This reply should not be sent.";
    },
    async summarize() {
      return "";
    },
  };
  const conversationStore = {
    isConfigured: true,
    async getConversation() {
      return {
        summary: "",
        messages: [],
        sessionVersion: 0,
        updatedAt: "2026-03-31T00:00:00.000Z",
      };
    },
    async updateConversation(_userId, _updater, options) {
      assert.equal(options.expectedSessionVersion, 0);
      return {
        status: "stale_after_reset",
        conversation: {
          summary: "",
          messages: [],
          sessionVersion: 1,
          updatedAt: "2026-03-31T00:00:01.000Z",
        },
      };
    },
  };
  const chatService = createChatService({
    config: {
      maxRecentMessages: 12,
      maxContextChars: 6000,
    },
    llmService,
    conversationStore,
    promptBundle: {
      systemPrompt: "You are Meri Behen.",
    },
    imageStore: {
      isConfigured: false,
    },
  });

  const result = await chatService.respondToMessage({
    userId: "user-1",
    message: { text: "Need help" },
  });

  assert.equal(result.status, "stale_after_reset");
  assert.equal(result.text, "");
  assert.equal(result.shouldSendAudio, false);
});

test("respondToMessage sends image-only turns to the model with a fallback prompt and signed URL", async () => {
  let capturedMessages = null;
  let capturedOptions = null;

  const llmService = {
    isConfigured: true,
    configurationMessage: "Missing config",
    async chat(messages, options) {
      capturedMessages = messages;
      capturedOptions = options;
      return "You look great today.";
    },
    async summarize() {
      return "";
    },
  };
  const conversationStore = {
    isConfigured: true,
    async getConversation() {
      return {
        summary: "",
        messages: [],
        sessionVersion: 0,
        updatedAt: "2026-03-31T00:00:00.000Z",
      };
    },
    async updateConversation() {
      return {
        status: "updated",
        conversation: {
          summary: "",
          messages: [],
          sessionVersion: 0,
          updatedAt: "2026-03-31T00:00:01.000Z",
        },
      };
    },
  };
  const chatService = createChatService({
    config: {
      maxRecentMessages: 12,
      maxContextChars: 6000,
    },
    llmService,
    conversationStore,
    promptBundle: {
      systemPrompt: "You are Meri Behen.",
    },
    imageStore: {
      isConfigured: true,
      async createSignedUrl(path) {
        return `https://signed.example/${path}`;
      },
    },
  });

  const result = await chatService.respondToMessage({
    userId: "user-1",
    message: { imagePath: "image/path.jpg", imageStoredAt: "2026-03-31T00:00:00.000Z" },
  });

  assert.equal(result.status, "ok");
  assert.equal(result.text, "You look great today.");
  assert.equal(capturedOptions.requiresVision, true);
  assert.equal(capturedMessages.length, 2);
  assert.equal(capturedMessages[1].role, "user");
  assert.equal(capturedMessages[1].content[0].text, "The user shared this image. Answer using the image and the conversation context.");
  assert.equal(capturedMessages[1].content[1].image_url.url, "https://signed.example/image/path.jpg");
});

test("respondToMessage preserves image captions for image-plus-text turns", async () => {
  let capturedMessages = null;

  const llmService = {
    isConfigured: true,
    configurationMessage: "Missing config",
    async chat(messages) {
      capturedMessages = messages;
      return "Nice outfit.";
    },
    async summarize() {
      return "";
    },
  };
  const conversationStore = {
    isConfigured: true,
    async getConversation() {
      return {
        summary: "",
        messages: [],
        sessionVersion: 0,
        updatedAt: "2026-03-31T00:00:00.000Z",
      };
    },
    async updateConversation() {
      return {
        status: "updated",
        conversation: {
          summary: "",
          messages: [],
          sessionVersion: 0,
          updatedAt: "2026-03-31T00:00:01.000Z",
        },
      };
    },
  };
  const chatService = createChatService({
    config: {
      maxRecentMessages: 12,
      maxContextChars: 6000,
    },
    llmService,
    conversationStore,
    promptBundle: {
      systemPrompt: "You are Meri Behen.",
    },
    imageStore: {
      isConfigured: true,
      async createSignedUrl(path) {
        return `https://signed.example/${path}`;
      },
    },
  });

  await chatService.respondToMessage({
    userId: "user-1",
    message: {
      text: "How am I looking today in the photo?",
      imagePath: "image/path.jpg",
      imageStoredAt: "2026-03-31T00:00:00.000Z",
    },
  });

  assert.equal(capturedMessages[1].role, "user");
  assert.equal(capturedMessages[1].content[0].text, "How am I looking today in the photo?");
  assert.equal(capturedMessages[1].content[1].image_url.url, "https://signed.example/image/path.jpg");
});
