const path = require("path");

function parseNumber(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const rootDir = path.resolve(__dirname, "..");

const config = {
  port: parseNumber(process.env.PORT, 3000),
  groqApiKey: process.env.GROQ_API_KEY || "",
  groqChatModel: process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-20b",
  summaryModel: process.env.SUMMARY_MODEL || process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-20b",
  systemPrompt:
    process.env.SYSTEM_PROMPT || "You are Meri Behen, a friendly WhatsApp assistant.",
  conversationStorePath:
    process.env.CONVERSATION_STORE_PATH ||
    path.join(rootDir, "data", "conversations.json"),
  maxRecentMessages: parseNumber(process.env.MAX_RECENT_MESSAGES, 12),
  maxContextChars: parseNumber(process.env.MAX_CONTEXT_CHARS, 6000),
};

module.exports = { config };
