function getAudioFormat(codec) {
  switch (codec) {
    case "mp3":
      return { extension: "mp3", contentType: "audio/mpeg" };
    case "aac":
      return { extension: "aac", contentType: "audio/aac" };
    case "wav":
      return { extension: "wav", contentType: "audio/wav" };
    case "opus":
      return { extension: "ogg", contentType: "audio/ogg" };
    case "flac":
      return { extension: "flac", contentType: "audio/flac" };
    case "linear16":
      return { extension: "wav", contentType: "audio/wav" };
    case "mulaw":
      return { extension: "mulaw", contentType: "audio/basic" };
    case "alaw":
      return { extension: "alaw", contentType: "audio/basic" };
    default:
      return { extension: "wav", contentType: "audio/wav" };
  }
}

function isSaarasV3Model(model) {
  return String(model || "").trim().toLowerCase() === "saaras:v3";
}

async function readErrorDetails(response) {
  const details = await response.text();
  return details || response.statusText || "Unknown error";
}

function createSarvamService(config) {
  if (!config.sarvamApiKey) {
    return {
      isConfigured: false,
      async detectTextLanguage() {
        throw new Error("Missing SARVAM_API_KEY");
      },
      async transcribe() {
        throw new Error("Missing SARVAM_API_KEY");
      },
      async synthesize() {
        throw new Error("Missing SARVAM_API_KEY");
      },
    };
  }

  return {
    isConfigured: true,
    async detectTextLanguage({ text }) {
      const input = String(text || "").trim();

      if (!input) {
        throw new Error("Sarvam language detection requires non-empty text.");
      }

      const response = await fetch("https://api.sarvam.ai/text-lid", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-subscription-key": config.sarvamApiKey,
        },
        body: JSON.stringify({
          input: input.slice(0, 1000),
        }),
      });

      if (!response.ok) {
        const details = await readErrorDetails(response);
        const error = new Error(
          `Sarvam language detection failed with ${response.status}: ${details}`
        );
        error.status = response.status;
        throw error;
      }

      const data = await response.json();

      return {
        requestId: data.request_id || null,
        languageCode: data.language_code || null,
        scriptCode: data.script_code || null,
      };
    },
    async transcribe({ audioBuffer, contentType, filename, languageCode }) {
      if (!audioBuffer || !audioBuffer.length) {
        throw new Error("Sarvam transcription requires non-empty audio data.");
      }

      console.log(
        `Transcribing audio with Sarvam. bytes=${audioBuffer.length} contentType=${contentType || "unknown"} model=${config.sarvamSttModel} language=${languageCode || "unknown"}`
      );

      const form = new FormData();
      const blob = new Blob([audioBuffer], {
        type: contentType || "application/octet-stream",
      });

      form.append("file", blob, filename || "audio");
      form.append("model", config.sarvamSttModel);

      if (isSaarasV3Model(config.sarvamSttModel)) {
        form.append("mode", "transcribe");
      }

      if (languageCode) {
        form.append("language_code", languageCode);
      }

      const response = await fetch("https://api.sarvam.ai/speech-to-text", {
        method: "POST",
        headers: {
          "api-subscription-key": config.sarvamApiKey,
        },
        body: form,
      });

      if (!response.ok) {
        const details = await readErrorDetails(response);
        const error = new Error(
          `Sarvam STT failed with ${response.status}: ${details}`
        );
        error.status = response.status;
        throw error;
      }

      const data = await response.json();

      return {
        requestId: data.request_id || null,
        transcript: typeof data.transcript === "string" ? data.transcript.trim() : "",
        languageCode: data.language_code || null,
        languageProbability:
          typeof data.language_probability === "number"
            ? data.language_probability
            : null,
      };
    },
    async synthesize({ text, languageCode }) {
      console.log(
        `Generating audio with Sarvam. language=${languageCode} model=${config.sarvamTtsModel} speaker=${config.sarvamTtsSpeaker} codec=${config.sarvamOutputAudioCodec}`
      );

      const response = await fetch("https://api.sarvam.ai/text-to-speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-subscription-key": config.sarvamApiKey,
        },
        body: JSON.stringify({
          text,
          target_language_code: languageCode,
          model: config.sarvamTtsModel,
          speaker: config.sarvamTtsSpeaker,
          pace: config.sarvamTtsPace,
          speech_sample_rate: config.sarvamSpeechSampleRate,
          output_audio_codec: config.sarvamOutputAudioCodec,
        }),
      });

      if (!response.ok) {
        const details = await readErrorDetails(response);
        const error = new Error(
          `Sarvam TTS failed with ${response.status}: ${details}`
        );
        error.status = response.status;
        throw error;
      }

      const data = await response.json();
      const audioBase64 = Array.isArray(data.audios) ? data.audios[0] : null;

      if (!audioBase64) {
        throw new Error("Sarvam TTS response did not include audio data.");
      }

      const format = getAudioFormat(config.sarvamOutputAudioCodec);
      const buffer = Buffer.from(audioBase64, "base64");

      console.log(
        `Sarvam audio generated successfully. bytes=${buffer.length} contentType=${format.contentType}`
      );

      return {
        buffer,
        extension: format.extension,
        contentType: format.contentType,
      };
    },
  };
}

module.exports = { createSarvamService };
