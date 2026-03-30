const LANGUAGE_PATTERNS = [
  { code: "te-IN", pattern: /[\u0C00-\u0C7F]/u },
  { code: "ta-IN", pattern: /[\u0B80-\u0BFF]/u },
  { code: "kn-IN", pattern: /[\u0C80-\u0CFF]/u },
  { code: "ml-IN", pattern: /[\u0D00-\u0D7F]/u },
  { code: "gu-IN", pattern: /[\u0A80-\u0AFF]/u },
  { code: "bn-IN", pattern: /[\u0980-\u09FF]/u },
  { code: "pa-IN", pattern: /[\u0A00-\u0A7F]/u },
  { code: "od-IN", pattern: /[\u0B00-\u0B7F]/u },
  { code: "hi-IN", pattern: /[\u0900-\u097F]/u },
];

function detectSarvamLanguageCode(text) {
  const content = (text || "").trim();

  if (!content) {
    return null;
  }

  for (const entry of LANGUAGE_PATTERNS) {
    if (entry.pattern.test(content)) {
      return entry.code;
    }
  }

  if (/[A-Za-z]/.test(content)) {
    return "en-IN";
  }

  return null;
}

module.exports = { detectSarvamLanguageCode };
