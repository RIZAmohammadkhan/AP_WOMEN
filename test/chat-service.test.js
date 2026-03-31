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
