function normalizeContentType(value) {
  return String(value || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
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

function createTwilioMediaService({ config }) {
  async function downloadMedia({ mediaUrl, mediaContentType }) {
    const headers = {};
    const authHeader = getTwilioAuthHeader(config);

    if (authHeader) {
      headers.Authorization = authHeader;
    }

    const response = await fetch(mediaUrl, { headers });

    if (!response.ok) {
      const details = await response.text();
      const error = new Error(
        `Twilio media download failed with ${response.status}: ${details || response.statusText || "Unknown error"}`
      );
      error.status = response.status;
      throw error;
    }

    const responseContentType = normalizeContentType(
      response.headers.get("content-type")
    );
    const requestedContentType = normalizeContentType(mediaContentType);
    const resolvedContentType =
      responseContentType && responseContentType !== "application/octet-stream"
        ? responseContentType
        : requestedContentType || responseContentType || "application/octet-stream";

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: resolvedContentType,
    };
  }

  return {
    downloadMedia,
    normalizeContentType,
  };
}

module.exports = { createTwilioMediaService };
