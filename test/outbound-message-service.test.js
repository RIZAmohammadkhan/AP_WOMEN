const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_TWILIO_MESSAGE_BODY_LENGTH,
  createOutboundMessageService,
  splitTextForWhatsApp,
} = require("../lib/outbound-message-service");

test("splitTextForWhatsApp keeps chunks within Twilio body limits", () => {
  const sentence = "This is a sentence that should stay readable.";
  const longText = Array.from({ length: 120 }, () => sentence).join(" ");

  const chunks = splitTextForWhatsApp(longText, 160);

  assert.ok(chunks.length > 1);

  for (const chunk of chunks) {
    assert.ok(chunk.length <= 160);
  }
});

test("sendTextReply sends long replies as multiple outbound WhatsApp messages", async () => {
  const sentBodies = [];
  const service = createOutboundMessageService({
    twilioClient: {
      messages: {
        async create(payload) {
          sentBodies.push(payload.body);
          return {
            sid: `SM${sentBodies.length}`,
            status: "queued",
          };
        },
      },
    },
  });

  const longText = `${"A".repeat(MAX_TWILIO_MESSAGE_BODY_LENGTH)} ${"B".repeat(50)}`;

  const messages = await service.sendTextReply({
    text: longText,
    to: "whatsapp:+15550001111",
    from: "whatsapp:+15550002222",
  });

  assert.equal(messages.length, 2);
  assert.equal(sentBodies.length, 2);
  assert.equal(sentBodies[0].length, MAX_TWILIO_MESSAGE_BODY_LENGTH);
  assert.equal(sentBodies[1], "B".repeat(50));
});
