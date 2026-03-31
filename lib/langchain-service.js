const {
  getProviderApiKeyEnvNames,
  getProviderConfig,
  getProviderLabel,
} = require("./llm-provider-config");

function createConfigurationError(message) {
  const error = new Error(message);
  error.isConfigurationError = true;
  return error;
}

function looksLikeConfigurationError(error) {
  if (!error) {
    return false;
  }

  const message = String(error.message || "").toLowerCase();

  return (
    error.isConfigurationError === true ||
    error.status === 401 ||
    error.status === 403 ||
    message.includes("missing api key") ||
    message.includes("api key") ||
    message.includes("authentication") ||
    message.includes("unauthorized") ||
    message.includes("invalid x-api-key") ||
    message.includes("incorrect api key")
  );
}

function buildConfigurationMessage(config) {
  const providerConfig = getProviderConfig(config.llmProvider);

  if (!providerConfig) {
    return [
      "I'm not configured yet.",
      "Set LLM_PROVIDER to groq, openai, anthropic, or gemini.",
    ].join(" ");
  }

  if (!config.llmTextModel) {
    return [
      "I'm not configured yet.",
      `Please set ${providerConfig.modelEnvNames.text[0]} for the selected provider and try again.`,
    ].join(" ");
  }

  if (!config.llmSummaryModel) {
    return [
      "I'm not configured yet.",
      `Please set ${providerConfig.modelEnvNames.summary[0]} for the selected provider and try again.`,
    ].join(" ");
  }

  const requiredApiKeyNames = getProviderApiKeyEnvNames(config.llmProvider);

  if (!config.llmApiKey) {
    return [
      "I'm not configured yet.",
      `Please add ${requiredApiKeyNames.join(" or ")} for ${getProviderLabel(
        config.llmProvider
      )} and try again.`,
    ].join(" ");
  }

  return [
    "I'm not configured yet.",
    "Please verify the selected LLM provider settings and try again.",
  ].join(" ");
}

function resolveLangChainModel(config, options = {}) {
  const purpose = options.purpose || "chat";

  if (purpose === "summary") {
    return {
      model: config.llmSummaryModel,
      requiresVision: false,
      usedFallback: false,
    };
  }

  return {
    model: options.requiresVision
      ? config.llmVisionModel || config.llmTextModel
      : config.llmTextModel,
    requiresVision: Boolean(options.requiresVision),
    usedFallback: Boolean(options.requiresVision && config.llmUsedVisionFallback),
    requestedVisionModel: config.llmRequestedVisionModel,
  };
}

function buildLangChainModelFields(config, options = {}) {
  const purpose = options.purpose || "chat";
  const baseFields = {
    modelProvider: config.llmProvider,
    temperature: purpose === "summary" ? 0.2 : 0.4,
  };

  switch (config.llmProvider) {
    case "openai":
      return {
        ...baseFields,
        apiKey: config.openaiApiKey,
        maxTokens: config.llmMaxOutputTokens,
      };
    case "anthropic":
      return {
        ...baseFields,
        apiKey: config.anthropicApiKey,
        maxTokens: config.llmMaxOutputTokens,
      };
    case "google-genai":
      return {
        ...baseFields,
        apiKey: config.geminiApiKey,
        maxOutputTokens: config.llmMaxOutputTokens,
      };
    case "groq":
      return {
        ...baseFields,
        apiKey: config.groqApiKey,
        maxTokens: config.llmMaxOutputTokens,
      };
    default:
      return baseFields;
  }
}

function extractTextFromAiMessage(aiMessage) {
  const content = aiMessage?.content;

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

async function loadLangChainModules() {
  const [{ initChatModel }, messageModule] = await Promise.all([
    import("langchain/chat_models/universal"),
    import("@langchain/core/messages"),
  ]);

  return {
    initChatModel,
    AIMessage: messageModule.AIMessage,
    HumanMessage: messageModule.HumanMessage,
    SystemMessage: messageModule.SystemMessage,
  };
}

async function convertRemoteImageToDataUrl(url) {
  const response = await fetch(url);

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Failed to fetch image for Gemini with ${response.status}: ${details || response.statusText || "Unknown error"}`
    );
  }

  const contentType =
    String(response.headers.get("content-type") || "")
      .split(";")[0]
      .trim() || "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());

  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function normalizeImageBlock(imageUrlValue, provider, dataUrlCache) {
  const url =
    typeof imageUrlValue === "string"
      ? imageUrlValue
      : imageUrlValue?.url;

  if (!url) {
    return null;
  }

  if (provider !== "google-genai" || url.startsWith("data:")) {
    return {
      type: "image_url",
      image_url: { url },
    };
  }

  let dataUrlPromise = dataUrlCache.get(url);

  if (!dataUrlPromise) {
    dataUrlPromise = convertRemoteImageToDataUrl(url);
    dataUrlCache.set(url, dataUrlPromise);
  }

  return {
    type: "image_url",
    image_url: { url: await dataUrlPromise },
  };
}

async function normalizeContent(content, provider, dataUrlCache) {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const normalizedParts = await Promise.all(
    content.map(async (part) => {
      if (typeof part === "string") {
        return {
          type: "text",
          text: part,
        };
      }

      if (part?.type === "text" && typeof part.text === "string") {
        return {
          type: "text",
          text: part.text,
        };
      }

      if (part?.type === "image_url") {
        return normalizeImageBlock(part.image_url, provider, dataUrlCache);
      }

      return null;
    })
  );

  return normalizedParts.filter(Boolean);
}

async function convertMessageToLangChainMessage(
  message,
  constructors,
  provider,
  dataUrlCache
) {
  const content = await normalizeContent(
    message?.content,
    provider,
    dataUrlCache
  );

  if (message?.role === "system") {
    return new constructors.SystemMessage(content);
  }

  if (message?.role === "assistant") {
    return new constructors.AIMessage(content);
  }

  return new constructors.HumanMessage(content);
}

function createLangChainService(config) {
  const configurationMessage = buildConfigurationMessage(config);
  const isConfigured = Boolean(
    getProviderConfig(config.llmProvider) &&
      config.llmTextModel &&
      config.llmSummaryModel &&
      config.llmApiKey
  );
  const modelCache = new Map();
  let warnedGroqVisionFallback = false;

  async function getChatModel(options = {}) {
    if (!isConfigured) {
      throw createConfigurationError(configurationMessage);
    }

    const purpose = options.purpose || "chat";
    const cacheKey =
      purpose === "summary"
        ? "summary"
        : options.requiresVision
          ? "chat:vision"
          : "chat:text";

    if (!modelCache.has(cacheKey)) {
      modelCache.set(
        cacheKey,
        (async () => {
          const { initChatModel } = await loadLangChainModules();
          const resolvedModel = resolveLangChainModel(config, options);

          if (
            config.llmProvider === "groq" &&
            resolvedModel.usedFallback &&
            !warnedGroqVisionFallback
          ) {
            warnedGroqVisionFallback = true;
            console.warn(
              `Configured GROQ_VISION_MODEL "${resolvedModel.requestedVisionModel}" does not appear to support image input on Groq. Falling back to "${resolvedModel.model}".`
            );
          }

          return initChatModel(
            resolvedModel.model,
            buildLangChainModelFields(config, options)
          );
        })()
      );
    }

    return modelCache.get(cacheKey);
  }

  async function invoke(messages, options = {}) {
    if (!isConfigured) {
      throw createConfigurationError(configurationMessage);
    }

    const langChainModules = await loadLangChainModules();
    const dataUrlCache = new Map();
    const langChainMessages = await Promise.all(
      (messages || []).map((message) =>
        convertMessageToLangChainMessage(
          message,
          langChainModules,
          config.llmProvider,
          dataUrlCache
        )
      )
    );

    try {
      const model = await getChatModel(options);
      return await model.invoke(langChainMessages);
    } catch (error) {
      if (looksLikeConfigurationError(error)) {
        throw createConfigurationError(configurationMessage);
      }

      throw error;
    }
  }

  return {
    provider: config.llmProvider,
    providerLabel: getProviderLabel(config.llmProvider),
    isConfigured,
    configurationMessage,
    async getChatModel(options = {}) {
      return getChatModel(options);
    },
    async invoke(messages, options = {}) {
      return invoke(messages, options);
    },
    async chat(messages, options = {}) {
      const response = await invoke(messages, options);
      return extractTextFromAiMessage(response);
    },
    async summarize(messages) {
      const response = await invoke(messages, { purpose: "summary" });
      return extractTextFromAiMessage(response);
    },
  };
}

module.exports = {
  buildConfigurationMessage,
  buildLangChainModelFields,
  createLangChainService,
  extractTextFromAiMessage,
  getProviderApiKeyEnvNames,
  getProviderLabel,
  resolveLangChainModel,
};
