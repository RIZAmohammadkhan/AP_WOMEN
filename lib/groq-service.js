const Groq = require("groq-sdk");

function extractText(response) {
  return response?.choices?.[0]?.message?.content?.trim() || "";
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
    async chat(messages) {
      const response = await client.chat.completions.create({
        model: config.groqChatModel,
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
