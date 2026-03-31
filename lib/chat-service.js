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

const TURN_MODES = {
  GREETING_OR_REENTRY: "greeting_or_reentry",
  CLARIFICATION_NEEDED: "clarification_needed",
  DIRECT_ANSWER: "direct_answer",
  IMAGE_FOLLOW_UP: "image_follow_up",
};

function normalizeMessages(messages) {
  return Array.isArray(messages)
    ? messages.map(normalizeMessage).filter(Boolean)
    : [];
}

function normalizeText(text) {
  return String(text || "").trim().toLowerCase();
}

function hasConversationContext(conversation) {
  return Boolean(
    (conversation?.summary || "").trim() ||
      (conversation?.messages || []).length > 0
  );
}

function hasRecentImageContext(messages) {
  return (messages || [])
    .slice(-4)
    .some((message) => typeof message?.imagePath === "string" && message.imagePath);
}

function isGreetingMessage(text) {
  if (!text) {
    return false;
  }

  return /^(hi|hii|hello|hey|namaste|namaskaram|good morning|good afternoon|good evening)$/.test(
    normalizeText(text)
  );
}

function isGenericClarificationText(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return true;
  }

  if (normalized.split(/\s+/).length <= 3) {
    return true;
  }

  return [
    "can you help",
    "i need help",
    "i want to sell",
    "where to sell",
    "sell online",
    "need buyers",
    "need buyer",
    "buyer",
    "buyers",
    "scheme",
    "schemes",
    "loan",
    "loans",
    "market price",
    "price",
    "prices",
    "what can you do",
    "how to start",
  ].some((pattern) => normalized === pattern || normalized.startsWith(`${pattern} `));
}

function looksLikeImageFollowUp(text) {
  if (!text) {
    return false;
  }

  return /\b(this|that|it|image|photo|picture|pic)\b/.test(normalizeText(text));
}

function classifyTurn(conversation, latestUserMessage) {
  if (!latestUserMessage) {
    return TURN_MODES.DIRECT_ANSWER;
  }

  if (latestUserMessage.imagePath) {
    return TURN_MODES.IMAGE_FOLLOW_UP;
  }

  const text = latestUserMessage.text || "";
  const hasContext = hasConversationContext(conversation);

  if (
    hasRecentImageContext(conversation?.messages || []) &&
    looksLikeImageFollowUp(text)
  ) {
    return TURN_MODES.IMAGE_FOLLOW_UP;
  }

  if (!hasContext && isGreetingMessage(text)) {
    return TURN_MODES.GREETING_OR_REENTRY;
  }

  if (isGenericClarificationText(text)) {
    return TURN_MODES.CLARIFICATION_NEEDED;
  }

  return TURN_MODES.DIRECT_ANSWER;
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
        "Write a compact factual summary for future turns.",
        "Preserve the user's language, goals, product or business context, unresolved questions, promised next steps, and notable image references.",
        "Do not add new facts or commentary.",
        "Use this exact structure:",
        "Language:",
        "User goal:",
        "Product or context:",
        "Pending question:",
        "Promised next step:",
        "Notable image references:",
        "Keep each line short and reusable.",
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

function buildChatMessage(message, imageUrlByPath) {
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

function buildTurnInstruction(turnMode) {
  switch (turnMode) {
    case TURN_MODES.GREETING_OR_REENTRY:
      return [
        "Current turn mode: greeting_or_reentry.",
        "Welcome the user naturally and briefly say how you can help.",
        "Invite the next concrete need in one sentence.",
      ].join(" ");
    case TURN_MODES.CLARIFICATION_NEEDED:
      return [
        "Current turn mode: clarification_needed.",
        "Ask exactly one short, pointed follow-up question.",
        "Do not give a long partial answer.",
      ].join(" ");
    case TURN_MODES.IMAGE_FOLLOW_UP:
      return [
        "Current turn mode: image_follow_up.",
        "Use the image and recent context carefully.",
        "If the image is unclear, ask one short clarifying question; otherwise answer directly and mention the visual detail you relied on.",
        "End with one short next-step line.",
      ].join(" ");
    default:
      return [
        "Current turn mode: direct_answer.",
        "Answer directly using remembered context when helpful.",
        "End with one short next-step or check-in line.",
      ].join(" ");
  }
}

async function buildChatMessages({
  systemPrompt,
  summary,
  messages,
  latestUserMessage,
  turnMode,
  imageStore,
}) {
  const allMessages = messages.concat(latestUserMessage);
  const imageUrlByPath = await resolveImageUrls(imageStore, allMessages);
  const systemSections = [systemPrompt, buildTurnInstruction(turnMode)];

  if (summary) {
    systemSections.push(`Conversation summary so far:\n${summary}`);
  }

  const chatMessages = [
    {
      role: "system",
      content: systemSections.filter(Boolean).join("\n\n"),
    },
  ];

  for (const message of allMessages) {
    chatMessages.push(buildChatMessage(message, imageUrlByPath));
  }

  return {
    messages: chatMessages,
    requiresVision: Boolean(imageUrlByPath.size),
  };
}

function isConfigurationError(error) {
  return Boolean(error?.isConfigurationError);
}

function createChatService({
  config,
  llmService,
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
      updatedSummary = await llmService.summarize(
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
      sessionVersion: conversation.sessionVersion,
      updatedAt: conversation.updatedAt,
    };
  }

  return {
    async respondToMessage({ userId, message }) {
      if (!llmService.isConfigured) {
        return {
          status: "ok",
          text: llmService.configurationMessage,
          shouldSendAudio: false,
        };
      }

      if (!conversationStore.isConfigured) {
        return {
          status: "ok",
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
          status: "ok",
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
      const turnMode = classifyTurn(
        compactedConversation,
        normalizedIncomingMessage
      );

      const chatPayload = await buildChatMessages({
        systemPrompt,
        summary: compactedConversation.summary,
        messages: compactedConversation.messages,
        latestUserMessage: normalizedIncomingMessage,
        turnMode,
        imageStore,
      });

      let assistantReply;

      try {
        assistantReply = await llmService.chat(chatPayload.messages, {
          requiresVision: chatPayload.requiresVision,
        });
      } catch (error) {
        if (isConfigurationError(error)) {
          console.error("LLM configuration error:", error);
          return {
            status: "ok",
            text: llmService.configurationMessage,
            shouldSendAudio: false,
          };
        }

        throw error;
      }

      const replyText =
        assistantReply || "I'm sorry, I couldn't prepare a reply just now.";

      const persistedConversation = await conversationStore.updateConversation(
        userId,
        () => ({
          summary: compactedConversation.summary,
          messages: compactedConversation.messages.concat(
            normalizedIncomingMessage,
            { role: "assistant", text: replyText }
          ),
        }),
        {
          expectedSessionVersion: normalizedConversation.sessionVersion,
        }
      );

      if (persistedConversation.status === "stale_after_reset") {
        return {
          status: "stale_after_reset",
          text: "",
          shouldSendAudio: false,
        };
      }

      return {
        status: "ok",
        text: replyText,
        shouldSendAudio: Boolean(assistantReply),
      };
    },
  };
}

module.exports = {
  TURN_MODES,
  buildSummaryPrompt,
  classifyTurn,
  createChatService,
  normalizeMessage,
  normalizeMessages,
};
