const test = require("node:test");
const assert = require("node:assert/strict");

const { createAudioInputService } = require("../lib/audio-input-service");

function createTwilioMediaService(downloadedMedia) {
  return {
    normalizeContentType(value) {
      return String(value || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
    },
    async downloadMedia() {
      return downloadedMedia;
    },
  };
}

test("transcribeIncomingAudio supports audio-only WhatsApp voice notes", async () => {
  const service = createAudioInputService({
    config: {
      enableAudioInput: true,
    },
    sarvamService: {
      isConfigured: true,
      async transcribe() {
        return {
          transcript: "I need help selling my products",
          languageCode: "en-IN",
        };
      },
      async detectTextLanguage() {
        return {
          languageCode: "en-IN",
          scriptCode: "Latn",
        };
      },
    },
    twilioMediaService: createTwilioMediaService({
      buffer: Buffer.from("audio-bytes"),
      contentType: "audio/ogg",
    }),
  });

  const result = await service.transcribeIncomingAudio({
    mediaUrl: "https://example.com/audio.ogg",
    mediaContentType: "audio/ogg",
  });

  assert.equal(result.text, "I need help selling my products");
  assert.equal(result.transcriptionLanguageCode, "en-IN");
  assert.equal(result.detectedLanguageCode, "en-IN");
});
