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

const config = {
  port: parseNumber(process.env.PORT, 3000),
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
  twilioWhatsAppFrom: process.env.TWILIO_WHATSAPP_FROM || "",
  groqApiKey: process.env.GROQ_API_KEY || "",
  groqChatModel: process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-20b",
  groqVisionModel:
    process.env.GROQ_VISION_MODEL ||
    "meta-llama/llama-4-scout-17b-16e-instruct",
  summaryModel: process.env.SUMMARY_MODEL || process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-20b",
  systemPrompt:
    process.env.SYSTEM_PROMPT || "You are Meri Behen, a friendly WhatsApp assistant.",
  supabaseUrl: (process.env.SUPABASE_URL || "").trim(),
  supabaseServiceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
  supabaseConversationsTable:
    (process.env.SUPABASE_CONVERSATIONS_TABLE || "conversations").trim(),
  supabaseImageBucket:
    (process.env.SUPABASE_IMAGE_BUCKET || "conversation-images").trim(),
  supabaseSignedImageUrlTtlSeconds: parseNumber(
    process.env.SUPABASE_SIGNED_IMAGE_URL_TTL_SECONDS,
    60 * 60
  ),
  supabaseImageRetentionDays: parseNumber(
    process.env.SUPABASE_IMAGE_RETENTION_DAYS,
    7
  ),
  imageCleanupIntervalMs: parseNumber(
    process.env.IMAGE_CLEANUP_INTERVAL_MS,
    60 * 60 * 1000
  ),
  maxRecentMessages: parseNumber(process.env.MAX_RECENT_MESSAGES, 12),
  maxContextChars: parseNumber(process.env.MAX_CONTEXT_CHARS, 6000),
  enableAudioInput: parseBoolean(process.env.ENABLE_AUDIO_INPUT, false),
  enableAudioOutput: parseBoolean(
    process.env.ENABLE_AUDIO_OUTPUT,
    parseBoolean(process.env.ENABLE_AUDIO_RESPONSE, false)
  ),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, ""),
  sarvamApiKey: process.env.SARVAM_API_KEY || "",
  sarvamSttModel: process.env.SARVAM_STT_MODEL || "saaras:v3",
  sarvamTtsModel: process.env.SARVAM_TTS_MODEL || "bulbul:v3",
  sarvamTtsSpeaker: process.env.SARVAM_TTS_SPEAKER || "shreya",
  sarvamOutputAudioCodec: process.env.SARVAM_OUTPUT_AUDIO_CODEC || "opus",
  sarvamSpeechSampleRate: parseNumber(process.env.SARVAM_SPEECH_SAMPLE_RATE, 24000),
  sarvamTtsPace: parseDecimal(process.env.SARVAM_TTS_PACE, 1),
  audioMediaTtlMs: parseNumber(process.env.AUDIO_MEDIA_TTL_MS, 10 * 60 * 1000),
};

module.exports = { config };
