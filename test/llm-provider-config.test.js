const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_GROQ_VISION_MODEL,
  normalizeGoogleGenAiModel,
  normalizeLlmProvider,
  resolveProviderModels,
} = require("../lib/llm-provider-config");

test("normalizeLlmProvider maps gemini aliases to google-genai", () => {
  assert.equal(normalizeLlmProvider("gemini"), "google-genai");
  assert.equal(normalizeLlmProvider("Google"), "google-genai");
});

test("resolveProviderModels uses provider-specific model envs first", () => {
  const result = resolveProviderModels(
    {
      OPENAI_TEXT_MODEL: "openai-best",
      OPENAI_VISION_MODEL: "openai-vision",
      OPENAI_SUMMARY_MODEL: "openai-summary",
    },
    "openai"
  );

  assert.equal(result.textModel, "openai-best");
  assert.equal(result.visionModel, "openai-vision");
  assert.equal(result.summaryModel, "openai-summary");
});

test("resolveProviderModels keeps plug-and-play defaults when no envs are set", () => {
  const result = resolveProviderModels({}, "google-genai");

  assert.equal(result.textModel, "gemini-2.5-pro");
  assert.equal(result.visionModel, "gemini-2.5-pro");
  assert.equal(result.summaryModel, "gemini-2.5-pro");
});

test("resolveProviderModels falls back to the default groq vision model for text-only models", () => {
  const result = resolveProviderModels(
    {
      GROQ_TEXT_MODEL: "openai/gpt-oss-120b",
      GROQ_VISION_MODEL: "openai/gpt-oss-120b",
    },
    "groq"
  );

  assert.equal(result.visionModel, DEFAULT_GROQ_VISION_MODEL);
  assert.equal(result.usedVisionFallback, true);
});

test("normalizeGoogleGenAiModel rewrites flash latest alias to a versioned multimodal model", () => {
  assert.equal(normalizeGoogleGenAiModel("gemini-flash-latest"), "gemini-2.5-flash");
});

test("resolveProviderModels normalizes gemini latest aliases before LangChain sees them", () => {
  const result = resolveProviderModels(
    {
      GEMINI_TEXT_MODEL: "gemini-flash-latest",
      GEMINI_VISION_MODEL: "gemini-flash-latest",
      GEMINI_SUMMARY_MODEL: "gemini-flash-latest",
    },
    "google-genai"
  );

  assert.equal(result.textModel, "gemini-2.5-flash");
  assert.equal(result.visionModel, "gemini-2.5-flash");
  assert.equal(result.summaryModel, "gemini-2.5-flash");
});
