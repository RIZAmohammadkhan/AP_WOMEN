const test = require("node:test");
const assert = require("node:assert/strict");

const { createImageInputService } = require("../lib/image-input-service");

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

test("processIncomingImage supports image-only WhatsApp messages", async () => {
  const service = createImageInputService({
    twilioMediaService: createTwilioMediaService({
      buffer: Buffer.from("image-bytes"),
      contentType: "image/jpeg",
    }),
    imageStore: {
      isConfigured: true,
      async uploadImage() {
        return {
          path: "user-1/2026-03-31/image.jpg",
          uploadedAt: "2026-03-31T00:00:00.000Z",
        };
      },
    },
  });

  const result = await service.processIncomingImage({
    userId: "user-1",
    mediaUrl: "https://example.com/image.jpg",
    mediaContentType: "image/jpeg",
    text: "",
  });

  assert.equal(result.text, "");
  assert.equal(result.imagePath, "user-1/2026-03-31/image.jpg");
});

test("processIncomingImage preserves caption text when WhatsApp sends image plus text", async () => {
  const service = createImageInputService({
    twilioMediaService: createTwilioMediaService({
      buffer: Buffer.from("image-bytes"),
      contentType: "image/png",
    }),
    imageStore: {
      isConfigured: true,
      async uploadImage() {
        return {
          path: "user-1/2026-03-31/image.png",
          uploadedAt: "2026-03-31T00:00:00.000Z",
        };
      },
    },
  });

  const result = await service.processIncomingImage({
    userId: "user-1",
    mediaUrl: "https://example.com/image.png",
    mediaContentType: "image/png",
    text: "  How am I looking today in the photo?  ",
  });

  assert.equal(result.text, "How am I looking today in the photo?");
  assert.equal(result.imagePath, "user-1/2026-03-31/image.png");
});
