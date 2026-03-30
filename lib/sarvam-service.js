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

function createSarvamService(config) {
  if (!config.sarvamApiKey) {
    return {
      isConfigured: false,
      async synthesize() {
        throw new Error("Missing SARVAM_API_KEY");
      },
    };
  }

  return {
    isConfigured: true,
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
        const details = await response.text();
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
