const { randomUUID } = require("crypto");

function sanitizePathSegment(value) {
  return String(value || "unknown")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unknown";
}

function getImageExtension(contentType) {
  switch (String(contentType || "").toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    default:
      return "bin";
  }
}

class ImageStore {
  constructor({ config, supabaseClient }) {
    this.config = config;
    this.client = supabaseClient;
    this.isConfigured = Boolean(
      supabaseClient &&
        config.supabaseUrl &&
        config.supabaseServiceRoleKey &&
        config.supabaseImageBucket
    );
    this.bucketReadyPromise = null;
  }

  async ensureBucket() {
    if (!this.isConfigured) {
      throw new Error(
        "Supabase image storage is not configured. Please add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
      );
    }

    if (!this.bucketReadyPromise) {
      this.bucketReadyPromise = this.client.storage
        .createBucket(this.config.supabaseImageBucket, {
          public: false,
          allowedMimeTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/heic",
            "image/heif",
          ],
          fileSizeLimit: "10MB",
        })
        .then(({ error }) => {
          if (
            error &&
            !/already exists/i.test(error.message || "") &&
            error.status !== 409
          ) {
            throw error;
          }
        });
    }

    return this.bucketReadyPromise;
  }

  async uploadImage({ userId, buffer, contentType }) {
    await this.ensureBucket();

    const uploadedAt = new Date().toISOString();
    const datePrefix = uploadedAt.slice(0, 10);
    const path = `${sanitizePathSegment(userId)}/${datePrefix}/${randomUUID()}.${getImageExtension(
      contentType
    )}`;

    const { error } = await this.client.storage
      .from(this.config.supabaseImageBucket)
      .upload(path, buffer, {
        contentType,
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      throw error;
    }

    return { path, uploadedAt };
  }

  async createSignedUrl(path) {
    if (!path) {
      return null;
    }

    await this.ensureBucket();

    const { data, error } = await this.client.storage
      .from(this.config.supabaseImageBucket)
      .createSignedUrl(path, this.config.supabaseSignedImageUrlTtlSeconds);

    if (error) {
      throw error;
    }

    return data?.signedUrl || null;
  }

  async deleteImages(paths) {
    const uniquePaths = [...new Set((paths || []).filter(Boolean))];

    if (!uniquePaths.length) {
      return;
    }

    await this.ensureBucket();

    const { error } = await this.client.storage
      .from(this.config.supabaseImageBucket)
      .remove(uniquePaths);

    if (error) {
      throw error;
    }
  }
}

module.exports = { ImageStore };
