const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildConfigurationMessage,
  extractTextFromAiMessage,
  resolveLangChainModel,
} = require("../lib/langchain-service");

test("resolveLangChainModel uses a groq vision fallback for known text-only models", () => {
  const result = resolveLangChainModel(
    {
      llmProvider: "groq",
      llmTextModel: "openai/gpt-oss-120b",
      llmVisionModel: "meta-llama/llama-4-scout-17b-16e-instruct",
      llmSummaryModel: "openai/gpt-oss-120b",
      llmUsedVisionFallback: true,
      llmRequestedVisionModel: "openai/gpt-oss-120b",
    },
    { requiresVision: true }
  );

  assert.equal(result.model, "meta-llama/llama-4-scout-17b-16e-instruct");
  assert.equal(result.usedFallback, true);
});

test("buildConfigurationMessage explains missing model envs", () => {
  const message = buildConfigurationMessage({
    llmProvider: "openai",
    llmTextModel: "",
    llmSummaryModel: "",
    llmApiKey: "test",
    openaiApiKey: "test",
  });

  assert.match(message, /OPENAI_TEXT_MODEL/);
});

test("extractTextFromAiMessage joins text content blocks", () => {
  const text = extractTextFromAiMessage({
    content: [
      { type: "text", text: "Hello" },
      { type: "text", text: "World" },
    ],
  });

  assert.equal(text, "Hello\nWorld");
});
