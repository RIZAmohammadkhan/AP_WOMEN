function createUserFacingError(message) {
  const error = new Error(message);
  error.userMessage = message;
  return error;
}

function isSupportedImageContentType(contentType, normalizeContentType) {
  return normalizeContentType(contentType).startsWith("image/");
}

function createImageInputService({
  twilioMediaService,
  imageStore,
}) {
  async function processIncomingImage({
    userId,
    mediaUrl,
    mediaContentType,
    text,
  }) {
    if (!imageStore.isConfigured) {
      throw createUserFacingError(
        "Image support is not configured right now. Please send your message as text."
      );
    }

    if (!mediaUrl) {
      throw createUserFacingError(
        "I could not read that image. Please try again or send your question as text."
      );
    }

    const downloadedMedia = await twilioMediaService.downloadMedia({
      mediaUrl,
      mediaContentType,
    });

    if (
      !isSupportedImageContentType(
        downloadedMedia.contentType,
        twilioMediaService.normalizeContentType
      )
    ) {
      throw createUserFacingError(
        "That image format is not supported right now. Please send a JPG, PNG, or WebP image."
      );
    }

    const storedImage = await imageStore.uploadImage({
      userId,
      buffer: downloadedMedia.buffer,
      contentType: downloadedMedia.contentType,
    });

    return {
      text: typeof text === "string" ? text.trim() : "",
      imagePath: storedImage.path,
      imageStoredAt: storedImage.uploadedAt,
      imageContentType: downloadedMedia.contentType,
    };
  }

  return {
    isSupportedImageContentType(contentType) {
      return isSupportedImageContentType(
        contentType,
        twilioMediaService.normalizeContentType
      );
    },
    processIncomingImage,
  };
}

module.exports = { createImageInputService };
