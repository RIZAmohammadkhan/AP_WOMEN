const { detectSarvamLanguageCode } = require("./language");

function splitTextForTts(text, maxLength) {
  const content = (text || "").trim();

  if (!content) {
    return [];
  }

  const sentenceChunks = content
    .split(/(?<=[.!?।!?])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";

  function pushCurrent() {
    if (current) {
      chunks.push(current);
      current = "";
    }
  }

  for (const sentence of sentenceChunks) {
    if (sentence.length > maxLength) {
      pushCurrent();

      let remainder = sentence;
      while (remainder.length > maxLength) {
        let splitAt = remainder.lastIndexOf(" ", maxLength);
        if (splitAt <= 0) {
          splitAt = maxLength;
        }

        chunks.push(remainder.slice(0, splitAt).trim());
        remainder = remainder.slice(splitAt).trim();
      }

      if (remainder) {
        current = remainder;
      }

      continue;
    }

    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > maxLength) {
      pushCurrent();
      current = sentence;
    } else {
      current = next;
    }
  }

  pushCurrent();

  return chunks.length ? chunks : [content.slice(0, maxLength)];
}

function createAudioResponseService({
  config,
  audioStore,
  sarvamService,
  twilioClient,
}) {
  function resolvePublicBaseUrl(req) {
    if (config.publicBaseUrl) {
      return config.publicBaseUrl;
    }

    const forwardedProto = req.get("x-forwarded-proto");
    const protocol = forwardedProto || req.protocol || "https";
    const forwardedHost = req.get("x-forwarded-host");
    const host = forwardedHost || req.get("host");

    if (!host || /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
      return "";
    }

    return `${protocol}://${host}`.replace(/\/+$/, "");
  }

  async function sendAudioReply({ text, to, from, publicBaseUrl }) {
    console.log("Audio reply requested.");

    if (!config.enableAudioResponse) {
      console.log("Audio reply skipped: ENABLE_AUDIO_RESPONSE is disabled.");
      return;
    }

    if (!twilioClient) {
      console.warn("Audio reply skipped: Twilio REST client is not configured.");
      return;
    }

    if (!sarvamService.isConfigured) {
      console.warn("Audio reply skipped: Sarvam API key is not configured.");
      return;
    }

    if (!publicBaseUrl) {
      console.warn(
        "Audio reply skipped: PUBLIC_BASE_URL is missing or the request host is not publicly reachable."
      );
      return;
    }

    if (!from || !to) {
      console.warn("Audio reply skipped: missing WhatsApp sender or recipient.");
      return;
    }

    const languageCode = detectSarvamLanguageCode(text);
    if (!languageCode) {
      console.warn("Audio reply skipped: unsupported language for Sarvam TTS.");
      return;
    }

    console.log(`Audio language detected: ${languageCode}`);

    const chunks = splitTextForTts(text, 2200);
    console.log(`Audio reply split into ${chunks.length} chunk(s).`);

    for (const [index, chunk] of chunks.entries()) {
      console.log(
        `Generating chunk ${index + 1}/${chunks.length}. chars=${chunk.length}`
      );

      const audio = await sarvamService.synthesize({
        text: chunk,
        languageCode,
      });

      const storedAudio = audioStore.put(audio);
      const mediaUrl = new URL(
        `/media/${storedAudio.token}.${storedAudio.extension}`,
        publicBaseUrl
      ).toString();

      console.log(
        `Sending audio reply chunk ${index + 1}/${chunks.length} via ${mediaUrl}`
      );

      const message = await twilioClient.messages.create({
        from,
        to,
        mediaUrl: [mediaUrl],
      });

      console.log(
        `Twilio audio message queued successfully. sid=${message.sid} status=${message.status || "accepted"}`
      );
    }
  }

  return {
    resolvePublicBaseUrl,
    sendAudioReply,
  };
}

module.exports = { createAudioResponseService };
