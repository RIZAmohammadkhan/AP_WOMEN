const Groq = require("groq-sdk");

const DEFAULT_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const KNOWN_TEXT_ONLY_MODELS = new Set([
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
]);

function extractText(response) {
  const content = response?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part?.type === "text" && typeof part.text === "string") {
          return part.text;
        }

        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}

function isVisionCapableModel(model) {
  return Boolean(model) && !KNOWN_TEXT_ONLY_MODELS.has(model);
}

function resolveGroqChatModel(config, options = {}) {
  if (!options.requiresVision) {
    return {
      model: config.groqChatModel,
      requiresVision: false,
      usedFallback: false,
    };
  }

  const requestedVisionModel = config.groqVisionModel || DEFAULT_VISION_MODEL;
  if (isVisionCapableModel(requestedVisionModel)) {
    return {
      model: requestedVisionModel,
      requiresVision: true,
      usedFallback: false,
    };
  }

  return {
    model: DEFAULT_VISION_MODEL,
    requiresVision: true,
    usedFallback: requestedVisionModel !== DEFAULT_VISION_MODEL,
    requestedVisionModel,
  };
}

function createGroqService(config) {
  if (!config.groqApiKey) {
    return {
      isConfigured: false,
      async chat() {
        throw new Error("Missing GROQ_API_KEY");
      },
      async summarize() {
        throw new Error("Missing GROQ_API_KEY");
      },
    };
  }

  const client = new Groq({
    apiKey: config.groqApiKey,
    timeout: 20_000,
    maxRetries: 2,
  });
  let warnedVisionFallback = false;

  return {
    isConfigured: true,
    async chat(messages, options = {}) {
      const resolvedModel = resolveGroqChatModel(config, options);

      if (resolvedModel.usedFallback && !warnedVisionFallback) {
        warnedVisionFallback = true;
        console.warn(
          `Configured GROQ_VISION_MODEL "${resolvedModel.requestedVisionModel}" does not appear to support image input. Falling back to "${resolvedModel.model}".`
        );
      }

      const response = await client.chat.completions.create({
        model: resolvedModel.model,
        temperature: 0.4,
        messages,
      });

      return extractText(response);
    },
    async summarize(messages) {
      const response = await client.chat.completions.create({
        model: config.summaryModel,
        temperature: 0.2,
        messages,
      });

      return extractText(response);
    },
  };
}

module.exports = {
  DEFAULT_VISION_MODEL,
  createGroqService,
  isVisionCapableModel,
  resolveGroqChatModel,
};
