const DEFAULT_GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

const KNOWN_GROQ_TEXT_ONLY_MODELS = new Set([
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "qwen/qwen3-32b",
]);

const PROVIDER_CONFIGS = {
  groq: {
    label: "Groq",
    apiKeyEnvNames: ["GROQ_API_KEY"],
    modelEnvNames: {
      text: ["GROQ_TEXT_MODEL", "GROQ_CHAT_MODEL", "LLM_TEXT_MODEL", "LLM_MODEL"],
      vision: ["GROQ_VISION_MODEL", "LLM_VISION_MODEL"],
      summary: ["GROQ_SUMMARY_MODEL", "LLM_SUMMARY_MODEL", "SUMMARY_MODEL"],
    },
    defaults: {
      text: "openai/gpt-oss-120b",
      vision: DEFAULT_GROQ_VISION_MODEL,
      summary: "openai/gpt-oss-120b",
    },
  },
  openai: {
    label: "OpenAI",
    apiKeyEnvNames: ["OPENAI_API_KEY"],
    modelEnvNames: {
      text: ["OPENAI_TEXT_MODEL", "LLM_TEXT_MODEL", "LLM_MODEL"],
      vision: ["OPENAI_VISION_MODEL", "LLM_VISION_MODEL"],
      summary: ["OPENAI_SUMMARY_MODEL", "LLM_SUMMARY_MODEL", "SUMMARY_MODEL"],
    },
    defaults: {
      text: "gpt-5.4",
      vision: "gpt-5.4",
      summary: "gpt-5.4",
    },
  },
  anthropic: {
    label: "Anthropic",
    apiKeyEnvNames: ["ANTHROPIC_API_KEY"],
    modelEnvNames: {
      text: ["ANTHROPIC_TEXT_MODEL", "LLM_TEXT_MODEL", "LLM_MODEL"],
      vision: ["ANTHROPIC_VISION_MODEL", "LLM_VISION_MODEL"],
      summary: ["ANTHROPIC_SUMMARY_MODEL", "LLM_SUMMARY_MODEL", "SUMMARY_MODEL"],
    },
    defaults: {
      text: "claude-opus-4-1-20250805",
      vision: "claude-opus-4-1-20250805",
      summary: "claude-opus-4-1-20250805",
    },
  },
  "google-genai": {
    label: "Gemini",
    apiKeyEnvNames: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    modelEnvNames: {
      text: ["GEMINI_TEXT_MODEL", "GOOGLE_GENAI_TEXT_MODEL", "LLM_TEXT_MODEL", "LLM_MODEL"],
      vision: ["GEMINI_VISION_MODEL", "GOOGLE_GENAI_VISION_MODEL", "LLM_VISION_MODEL"],
      summary: ["GEMINI_SUMMARY_MODEL", "GOOGLE_GENAI_SUMMARY_MODEL", "LLM_SUMMARY_MODEL", "SUMMARY_MODEL"],
    },
    defaults: {
      text: "gemini-2.5-pro",
      vision: "gemini-2.5-pro",
      summary: "gemini-2.5-pro",
    },
  },
};

const GOOGLE_GENAI_MODEL_ALIASES = {
  "gemini-flash-latest": "gemini-2.5-flash",
  "gemini-pro-latest": "gemini-2.5-pro",
};

function readEnvText(env, names) {
  for (const name of names) {
    const value = env[name];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function normalizeLlmProvider(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) {
    return "groq";
  }

  if (["gemini", "google", "google-genai"].includes(normalized)) {
    return "google-genai";
  }

  if (["anthropic", "claude"].includes(normalized)) {
    return "anthropic";
  }

  return normalized;
}

function getProviderConfig(provider) {
  return PROVIDER_CONFIGS[provider] || null;
}

function getProviderLabel(provider) {
  return getProviderConfig(provider)?.label || "LLM";
}

function getProviderApiKeyEnvNames(provider) {
  return getProviderConfig(provider)?.apiKeyEnvNames || [];
}

function normalizeGoogleGenAiModel(model) {
  const normalized = String(model || "").trim();

  if (!normalized) {
    return "";
  }

  return GOOGLE_GENAI_MODEL_ALIASES[normalized] || normalized;
}

function isGroqVisionCapableModel(model) {
  return Boolean(model) && !KNOWN_GROQ_TEXT_ONLY_MODELS.has(model);
}

function resolveProviderModels(env, provider) {
  const providerConfig = getProviderConfig(provider);

  if (!providerConfig) {
    return {
      textModel: "",
      visionModel: "",
      summaryModel: "",
    };
  }

  const textModel =
    readEnvText(env, providerConfig.modelEnvNames.text) ||
    providerConfig.defaults.text;
  const requestedVisionModel =
    readEnvText(env, providerConfig.modelEnvNames.vision) ||
    providerConfig.defaults.vision ||
    textModel;
  const summaryModel =
    readEnvText(env, providerConfig.modelEnvNames.summary) ||
    providerConfig.defaults.summary ||
    textModel;

  if (provider === "google-genai") {
    return {
      textModel: normalizeGoogleGenAiModel(textModel),
      visionModel: normalizeGoogleGenAiModel(requestedVisionModel || textModel),
      summaryModel: normalizeGoogleGenAiModel(summaryModel),
      usedVisionFallback: false,
      requestedVisionModel,
    };
  }

  if (provider === "groq" && !isGroqVisionCapableModel(requestedVisionModel)) {
    return {
      textModel,
      visionModel: DEFAULT_GROQ_VISION_MODEL,
      summaryModel,
      usedVisionFallback: requestedVisionModel !== DEFAULT_GROQ_VISION_MODEL,
      requestedVisionModel,
    };
  }

  return {
    textModel,
    visionModel: requestedVisionModel || textModel,
    summaryModel,
    usedVisionFallback: false,
    requestedVisionModel,
  };
}

function getProviderApiKey(env, provider) {
  return readEnvText(env, getProviderApiKeyEnvNames(provider));
}

module.exports = {
  DEFAULT_GROQ_VISION_MODEL,
  KNOWN_GROQ_TEXT_ONLY_MODELS,
  PROVIDER_CONFIGS,
  getProviderApiKey,
  getProviderApiKeyEnvNames,
  getProviderConfig,
  getProviderLabel,
  isGroqVisionCapableModel,
  normalizeGoogleGenAiModel,
  normalizeLlmProvider,
  readEnvText,
  resolveProviderModels,
};
