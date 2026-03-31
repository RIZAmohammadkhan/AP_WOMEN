function normalizeContentType(value) {
  return String(value || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

function isSupportedAudioContentType(contentType) {
  const normalized = normalizeContentType(contentType);
  return normalized.startsWith("audio/") || normalized === "application/ogg";
}

function getAudioExtension(contentType) {
  switch (normalizeContentType(contentType)) {
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/mp4":
    case "audio/x-m4a":
      return "m4a";
    case "audio/aac":
      return "aac";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/webm":
      return "webm";
    case "audio/flac":
      return "flac";
    case "audio/amr":
      return "amr";
    case "application/ogg":
    case "audio/ogg":
    case "audio/opus":
      return "ogg";
    default:
      return "audio";
  }
}

function getTwilioAuthHeader(config) {
  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    return null;
  }

  const token = Buffer.from(
    `${config.twilioAccountSid}:${config.twilioAuthToken}`,
    "utf8"
  ).toString("base64");

  return `Basic ${token}`;
}

function createUserFacingError(message) {
  const error = new Error(message);
  error.userMessage = message;
  return error;
}

function createAudioInputService({ config, sarvamService }) {
  async function downloadAudio({ mediaUrl, mediaContentType }) {
    const headers = {};
    const authHeader = getTwilioAuthHeader(config);

    if (authHeader) {
      headers.Authorization = authHeader;
    }

    const response = await fetch(mediaUrl, {
      headers,
    });

    if (!response.ok) {
      const details = await response.text();
      const error = new Error(
        `Audio download failed with ${response.status}: ${details || response.statusText || "Unknown error"}`
      );
      error.status = response.status;
      throw error;
    }

    const responseContentType = normalizeContentType(
      response.headers.get("content-type")
    );
    const requestedContentType = normalizeContentType(mediaContentType);
    const resolvedContentType =
      isSupportedAudioContentType(responseContentType)
        ? responseContentType
        : requestedContentType || responseContentType || "application/octet-stream";
    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      buffer,
      contentType: resolvedContentType,
      filename: `incoming-audio.${getAudioExtension(resolvedContentType)}`,
    };
  }

  async function transcribeIncomingAudio({ mediaUrl, mediaContentType }) {
    if (!config.enableAudioInput) {
      throw createUserFacingError(
        "Voice notes are not enabled right now. Please send your message as text."
      );
    }

    if (!sarvamService.isConfigured) {
      throw createUserFacingError(
        "Voice notes are not configured right now. Please send your message as text."
      );
    }

    if (!mediaUrl) {
      throw createUserFacingError(
        "I could not read that voice note. Please try again or send it as text."
      );
    }

    const downloadedAudio = await downloadAudio({
      mediaUrl,
      mediaContentType,
    });

    if (!isSupportedAudioContentType(downloadedAudio.contentType)) {
      throw createUserFacingError(
        "That audio format is not supported right now. Please send a different voice note or type your message."
      );
    }

    const transcription = await sarvamService.transcribe({
      audioBuffer: downloadedAudio.buffer,
      contentType: downloadedAudio.contentType,
      filename: downloadedAudio.filename,
      languageCode: "unknown",
    });

    if (!transcription.transcript) {
      throw createUserFacingError(
        "I could not transcribe that voice note. Please try again or send your message as text."
      );
    }

    let detectedLanguage = null;

    try {
      detectedLanguage = await sarvamService.detectTextLanguage({
        text: transcription.transcript,
      });
    } catch (error) {
      console.warn("Sarvam language detection failed for incoming audio:", error);
    }

    console.log(
      `Incoming audio transcribed successfully. transcriptChars=${transcription.transcript.length} sttLanguage=${transcription.languageCode || "unknown"} detectedLanguage=${detectedLanguage?.languageCode || "unknown"}`
    );

    return {
      text: transcription.transcript,
      transcriptionLanguageCode: transcription.languageCode,
      detectedLanguageCode: detectedLanguage?.languageCode || null,
      detectedScriptCode: detectedLanguage?.scriptCode || null,
    };
  }

  return {
    isSupportedAudioContentType,
    transcribeIncomingAudio,
  };
}

module.exports = { createAudioInputService };
