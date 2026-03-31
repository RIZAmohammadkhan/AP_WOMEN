function normalizeMessage(message) {
  if (!message || typeof message !== "object") {
    return null;
  }

  const role = message.role === "assistant" ? "assistant" : "user";
  const legacyContent =
    typeof message.content === "string" ? message.content : "";
  const text = typeof message.text === "string" ? message.text : legacyContent;
  const imagePath =
    role === "user" && typeof message.imagePath === "string"
      ? message.imagePath.trim()
      : "";
  const imageStoredAt =
    role === "user" && typeof message.imageStoredAt === "string"
      ? message.imageStoredAt.trim()
      : "";

  const normalized = {
    role,
    text: text.trim(),
  };

  if (imagePath) {
    normalized.imagePath = imagePath;
  }

  if (imageStoredAt) {
    normalized.imageStoredAt = imageStoredAt;
  }

  if (!normalized.text && !normalized.imagePath) {
    return null;
  }

  return normalized;
}

function normalizeMessages(messages) {
  return Array.isArray(messages)
    ? messages.map(normalizeMessage).filter(Boolean)
    : [];
}

function messageSummaryLine(message) {
  if (message.imagePath && message.text) {
    return `[Image] ${message.text}`;
  }

  if (message.imagePath) {
    return "[Image]";
  }

  return message.text;
}

function collectImagePaths(messages) {
  return (messages || [])
    .map((message) => message?.imagePath)
    .filter((path) => typeof path === "string" && path);
}

function estimateContextSize(systemPrompt, summary, messages, latestUserMessage) {
  const latestText = latestUserMessage
    ? `${latestUserMessage.text || ""}${latestUserMessage.imagePath ? " [image]" : ""}`
    : "";
  const parts = [
    systemPrompt,
    summary,
    latestText,
    ...messages.map(
      (message) => `${message.role}:${messageSummaryLine(message) || ""}`
    ),
  ];

  return parts.join("\n").length;
}

function shouldSummarize(config, conversation, latestUserMessage, systemPrompt) {
  const messageOverflow = conversation.messages.length > config.maxRecentMessages;
  const contextOverflow =
    estimateContextSize(
      systemPrompt,
      conversation.summary,
      conversation.messages,
      latestUserMessage
    ) > config.maxContextChars;

  return messageOverflow || contextOverflow;
}

function buildSummaryPrompt(existingSummary, messagesToCompress) {
  const transcript = messagesToCompress
    .map((message) => `${message.role.toUpperCase()}: ${messageSummaryLine(message)}`)
    .join("\n");

  return [
    {
      role: "system",
      content: [
        "You compress chat history for a WhatsApp assistant.",
        "Write a compact factual summary.",
        "Preserve user preferences, important background, unresolved questions, promised next steps, and notable image references.",
        "Do not add new facts or commentary.",
        "Keep it short and reusable for future turns.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Existing summary:\n${existingSummary || "None."}`,
        `Messages to compress:\n${transcript || "None."}`,
        "Return only the updated summary.",
      ].join("\n\n"),
    },
  ];
}

async function resolveImageUrls(imageStore, messages) {
  const uniquePaths = [
    ...new Set(
      messages
        .map((message) => message.imagePath)
        .filter((path) => typeof path === "string" && path)
    ),
  ];

  const imageUrlByPath = new Map();

  await Promise.all(
    uniquePaths.map(async (path) => {
      try {
        const url = await imageStore.createSignedUrl(path);
        if (url) {
          imageUrlByPath.set(path, url);
        }
      } catch (error) {
        console.error(`Failed to create signed image URL for ${path}:`, error);
      }
    })
  );

  return imageUrlByPath;
}

function buildGroqMessage(message, imageUrlByPath) {
  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: message.text,
    };
  }

  if (!message.imagePath) {
    return {
      role: "user",
      content: message.text,
    };
  }

  const parts = [];

  if (message.text) {
    parts.push({ type: "text", text: message.text });
  } else {
    parts.push({
      type: "text",
      text: "The user shared this image. Answer using the image and the conversation context.",
    });
  }

  const imageUrl = imageUrlByPath.get(message.imagePath);
  if (imageUrl) {
    parts.push({
      type: "image_url",
      image_url: { url: imageUrl },
    });
  }

  return {
    role: "user",
    content: parts,
  };
}

async function buildChatMessages({
  systemPrompt,
  summary,
  messages,
  latestUserMessage,
  imageStore,
}) {
  const allMessages = messages.concat(latestUserMessage);
  const imageUrlByPath = await resolveImageUrls(imageStore, allMessages);
  const chatMessages = [{ role: "system", content: systemPrompt }];

  if (summary) {
    chatMessages.push({
      role: "system",
      content: `Conversation summary so far:\n${summary}`,
    });
  }

  for (const message of allMessages) {
    chatMessages.push(buildGroqMessage(message, imageUrlByPath));
  }

  return {
    messages: chatMessages,
    requiresVision: Boolean(imageUrlByPath.size),
  };
}

function isConfigurationError(error) {
  if (!error) {
    return false;
  }

  return (
    error.status === 401 ||
    error.code === "invalid_api_key" ||
    error.message === "Missing GROQ_API_KEY" ||
    error?.error?.error?.code === "invalid_api_key"
  );
}

function createChatService({
  config,
  groqService,
  conversationStore,
  promptBundle,
  imageStore,
}) {
  const systemPrompt = promptBundle.systemPrompt;

  async function compactConversation(conversation, latestUserMessage) {
    if (!shouldSummarize(config, conversation, latestUserMessage, systemPrompt)) {
      return conversation;
    }

    const keepCount = Math.max(2, Math.ceil(config.maxRecentMessages / 2));
    const normalizedMessages = normalizeMessages(conversation.messages);
    const splitIndex = Math.max(0, normalizedMessages.length - keepCount);
    const messagesToCompress = normalizedMessages.slice(0, splitIndex);
    const recentMessages = normalizedMessages.slice(splitIndex);

    if (!messagesToCompress.length) {
      return {
        ...conversation,
        messages: recentMessages,
      };
    }

    let updatedSummary = conversation.summary;

    try {
      updatedSummary = await groqService.summarize(
        buildSummaryPrompt(conversation.summary, messagesToCompress)
      );
    } catch (error) {
      console.error("Conversation summarization failed:", error);
    }

    if (imageStore.isConfigured) {
      const imagePathsToDelete = collectImagePaths(messagesToCompress);
      if (imagePathsToDelete.length) {
        try {
          await imageStore.deleteImages(imagePathsToDelete);
        } catch (error) {
          console.error("Failed to delete summarized image files:", error);
        }
      }
    }

    return {
      summary: updatedSummary || conversation.summary,
      messages: recentMessages,
      updatedAt: conversation.updatedAt,
    };
  }

  return {
    async respondToMessage({ userId, message }) {
      if (!groqService.isConfigured) {
        return {
          text: "I'm not configured yet. Please add a Groq API key and try again.",
          shouldSendAudio: false,
        };
      }

      if (!conversationStore.isConfigured) {
        return {
          text: "I'm not configured yet. Please add Supabase credentials and try again.",
          shouldSendAudio: false,
        };
      }

      const normalizedIncomingMessage = normalizeMessage({
        role: "user",
        ...(message || {}),
      });

      if (!normalizedIncomingMessage) {
        return {
          text: "Please send a text message, voice note, or image so I can help you.",
          shouldSendAudio: false,
        };
      }

      const currentConversation = await conversationStore.getConversation(userId);
      const normalizedConversation = {
        ...currentConversation,
        messages: normalizeMessages(currentConversation.messages),
      };

      const compactedConversation = await compactConversation(
        normalizedConversation,
        normalizedIncomingMessage
      );

      const chatPayload = await buildChatMessages({
        systemPrompt,
        summary: compactedConversation.summary,
        messages: compactedConversation.messages,
        latestUserMessage: normalizedIncomingMessage,
        imageStore,
      });

      let assistantReply;

      try {
        assistantReply = await groqService.chat(chatPayload.messages, {
          requiresVision: chatPayload.requiresVision,
        });
      } catch (error) {
        if (isConfigurationError(error)) {
          console.error("Groq configuration error:", error);
          return {
            text: "I'm not configured yet. Please add a valid Groq API key and try again.",
            shouldSendAudio: false,
          };
        }

        throw error;
      }

      const replyText =
        assistantReply || "I'm sorry, I couldn't prepare a reply just now.";

      await conversationStore.updateConversation(userId, () => ({
        summary: compactedConversation.summary,
        messages: compactedConversation.messages.concat(
          normalizedIncomingMessage,
          { role: "assistant", text: replyText }
        ),
      }));

      return {
        text: replyText,
        shouldSendAudio: Boolean(assistantReply),
      };
    },
  };
}

module.exports = { createChatService };
