const Groq = require("groq-sdk");

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

  return {
    isConfigured: true,
    async chat(messages, options = {}) {
      const response = await client.chat.completions.create({
        model: options.requiresVision ? config.groqVisionModel : config.groqChatModel,
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

module.exports = { createGroqService };
