function isSupportedAudioContentType(contentType, normalizeContentType) {
  const normalized = normalizeContentType(contentType);
  return normalized.startsWith("audio/") || normalized === "application/ogg";
}

function getAudioExtension(contentType) {
  switch (String(contentType || "").split(";")[0].trim().toLowerCase()) {
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

function createUserFacingError(message) {
  const error = new Error(message);
  error.userMessage = message;
  return error;
}

function createAudioInputService({ config, sarvamService, twilioMediaService }) {
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

    const downloadedAudio = await twilioMediaService.downloadMedia({
      mediaUrl,
      mediaContentType,
    });

    if (
      !isSupportedAudioContentType(
        downloadedAudio.contentType,
        twilioMediaService.normalizeContentType
      )
    ) {
      throw createUserFacingError(
        "That audio format is not supported right now. Please send a different voice note or type your message."
      );
    }

    const transcription = await sarvamService.transcribe({
      audioBuffer: downloadedAudio.buffer,
      contentType: downloadedAudio.contentType,
      filename: `incoming-audio.${getAudioExtension(downloadedAudio.contentType)}`,
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
    isSupportedAudioContentType(contentType) {
      return isSupportedAudioContentType(
        contentType,
        twilioMediaService.normalizeContentType
      );
    },
    transcribeIncomingAudio,
  };
}

module.exports = { createAudioInputService };
