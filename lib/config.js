const path = require("path");

function parseNumber(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDecimal(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (value == null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

const rootDir = path.resolve(__dirname, "..");

const config = {
  port: parseNumber(process.env.PORT, 3000),
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
  twilioWhatsAppFrom: process.env.TWILIO_WHATSAPP_FROM || "",
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
  enableAudioResponse: parseBoolean(process.env.ENABLE_AUDIO_RESPONSE, false),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, ""),
  sarvamApiKey: process.env.SARVAM_API_KEY || "",
  sarvamTtsModel: process.env.SARVAM_TTS_MODEL || "bulbul:v3",
  sarvamTtsSpeaker: process.env.SARVAM_TTS_SPEAKER || "shreya",
  sarvamOutputAudioCodec: process.env.SARVAM_OUTPUT_AUDIO_CODEC || "opus",
  sarvamSpeechSampleRate: parseNumber(process.env.SARVAM_SPEECH_SAMPLE_RATE, 24000),
  sarvamTtsPace: parseDecimal(process.env.SARVAM_TTS_PACE, 1),
  audioMediaTtlMs: parseNumber(process.env.AUDIO_MEDIA_TTL_MS, 10 * 60 * 1000),
};

module.exports = { config };
