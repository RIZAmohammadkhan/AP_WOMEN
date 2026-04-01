const MAX_TWILIO_MESSAGE_BODY_LENGTH = 1600;

function splitTextForWhatsApp(text, maxLength = MAX_TWILIO_MESSAGE_BODY_LENGTH) {
  const content = String(text || "").trim();

  if (!content) {
    return [];
  }

  const paragraphs = content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!paragraphs.length) {
    return [content.slice(0, maxLength)];
  }

  const chunks = [];
  let current = "";

  function pushCurrent() {
    if (current) {
      chunks.push(current);
      current = "";
    }
  }

  function appendPart(part) {
    if (!part) {
      return;
    }

    if (part.length <= maxLength) {
      const next = current ? `${current}\n\n${part}` : part;
      if (next.length <= maxLength) {
        current = next;
        return;
      }

      pushCurrent();
      current = part;
      return;
    }

    const sentences = part
      .split(/(?<=[.!?।!?])\s+/u)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    if (!sentences.length) {
      let remainder = part;
      while (remainder.length > maxLength) {
        let splitAt = remainder.lastIndexOf(" ", maxLength);
        if (splitAt <= 0) {
          splitAt = maxLength;
        }

        chunks.push(remainder.slice(0, splitAt).trim());
        remainder = remainder.slice(splitAt).trim();
      }

      if (remainder) {
        appendPart(remainder);
      }
      return;
    }

    for (const sentence of sentences) {
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
  }

  for (const paragraph of paragraphs) {
    appendPart(paragraph);
  }

  pushCurrent();

  return chunks;
}

function createOutboundMessageService({ twilioClient }) {
  async function sendTextReply({ text, to, from }) {
    if (!twilioClient) {
      console.warn("Text output skipped: Twilio REST client is not configured.");
      return [];
    }

    if (!from || !to) {
      console.warn("Text output skipped: missing WhatsApp sender or recipient.");
      return [];
    }

    const chunks = splitTextForWhatsApp(text);

    if (!chunks.length) {
      console.warn("Text output skipped: reply text was empty.");
      return [];
    }

    console.log(`Text output split into ${chunks.length} chunk(s).`);

    const results = [];

    for (const [index, chunk] of chunks.entries()) {
      console.log(
        `Sending text reply chunk ${index + 1}/${chunks.length}. chars=${chunk.length}`
      );

      const message = await twilioClient.messages.create({
        from,
        to,
        body: chunk,
      });

      console.log(
        `Twilio text message queued successfully. sid=${message.sid} status=${message.status || "accepted"}`
      );

      results.push(message);
    }

    return results;
  }

  return {
    isConfigured: Boolean(twilioClient),
    sendTextReply,
  };
}

module.exports = {
  MAX_TWILIO_MESSAGE_BODY_LENGTH,
  createOutboundMessageService,
  splitTextForWhatsApp,
};
