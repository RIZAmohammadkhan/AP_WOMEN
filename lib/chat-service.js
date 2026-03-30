function normalizeMessages(messages) {
  return messages
    .filter((message) => message && typeof message.content === "string")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content.trim(),
    }))
    .filter((message) => message.content);
}

function estimateContextSize(systemPrompt, summary, messages, latestUserText) {
  const parts = [
    systemPrompt,
    summary,
    latestUserText,
    ...messages.map((message) => `${message.role}:${message.content}`),
  ];

  return parts.join("\n").length;
}

function shouldSummarize(config, conversation, latestUserText, systemPrompt) {
  const messageOverflow = conversation.messages.length > config.maxRecentMessages;
  const contextOverflow =
    estimateContextSize(
      systemPrompt,
      conversation.summary,
      conversation.messages,
      latestUserText
    ) > config.maxContextChars;

  return messageOverflow || contextOverflow;
}

function buildSummaryPrompt(existingSummary, messagesToCompress) {
  const transcript = messagesToCompress
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");

  return [
    {
      role: "system",
      content: [
        "You compress chat history for a WhatsApp assistant.",
        "Write a compact factual summary.",
        "Preserve user preferences, important background, unresolved questions, and promised next steps.",
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

function buildChatMessages(systemPrompt, summary, messages, userText) {
  const chatMessages = [{ role: "system", content: systemPrompt }];

  if (summary) {
    chatMessages.push({
      role: "system",
      content: `Conversation summary so far:\n${summary}`,
    });
  }

  return chatMessages.concat(messages, [{ role: "user", content: userText }]);
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

function createChatService({ config, groqService, conversationStore, promptBundle }) {
  const systemPrompt = promptBundle.systemPrompt;

  async function compactConversation(conversation, latestUserText) {
    if (!shouldSummarize(config, conversation, latestUserText, systemPrompt)) {
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

    return {
      summary: updatedSummary || conversation.summary,
      messages: recentMessages,
      updatedAt: conversation.updatedAt,
    };
  }

  return {
    async respondToMessage({ userId, text }) {
      if (!groqService.isConfigured) {
        return {
          text: "I'm not configured yet. Please add a Groq API key and try again.",
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
        text
      );

      const chatMessages = buildChatMessages(
        systemPrompt,
        compactedConversation.summary,
        compactedConversation.messages,
        text
      );

      let assistantReply;

      try {
        assistantReply = await groqService.chat(chatMessages);
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
          { role: "user", content: text },
          { role: "assistant", content: replyText }
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
