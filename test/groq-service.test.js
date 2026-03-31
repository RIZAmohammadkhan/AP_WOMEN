const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_VISION_MODEL,
  resolveGroqChatModel,
} = require("../lib/groq-service");

test("uses GPT OSS 120B for text-only turns when configured", () => {
  const result = resolveGroqChatModel(
    {
      groqChatModel: "openai/gpt-oss-120b",
      groqVisionModel: "meta-llama/llama-4-scout-17b-16e-instruct",
    },
    { requiresVision: false }
  );

  assert.equal(result.model, "openai/gpt-oss-120b");
  assert.equal(result.usedFallback, false);
});

test("falls back to the default vision model when GPT OSS 120B is configured for image turns", () => {
  const result = resolveGroqChatModel(
    {
      groqChatModel: "openai/gpt-oss-120b",
      groqVisionModel: "openai/gpt-oss-120b",
    },
    { requiresVision: true }
  );

  assert.equal(result.model, DEFAULT_VISION_MODEL);
  assert.equal(result.usedFallback, true);
});
