function parseImageStoredAt(message) {
  if (typeof message?.imageStoredAt === "string" && message.imageStoredAt) {
    const parsed = new Date(message.imageStoredAt);
    if (Number.isFinite(parsed.getTime())) {
      return parsed;
    }
  }

  const imagePath = typeof message?.imagePath === "string" ? message.imagePath : "";
  const match = imagePath.match(/^[^/]+\/(\d{4}-\d{2}-\d{2})\//);
  if (!match) {
    return null;
  }

  const parsed = new Date(`${match[1]}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function isExpiredDate(date, retentionDays, now) {
  if (!date) {
    return false;
  }

  return now.getTime() - date.getTime() >= retentionDays * 24 * 60 * 60 * 1000;
}

function collectExpiredImagePaths(messages, retentionDays, now) {
  return (messages || [])
    .filter((message) => message && message.imagePath)
    .filter((message) =>
      isExpiredDate(parseImageStoredAt(message), retentionDays, now)
    )
    .map((message) => message.imagePath)
    .filter(Boolean);
}

function stripExpiredImages(messages, retentionDays, now) {
  return (messages || []).map((message) => {
    if (!message || !message.imagePath) {
      return message;
    }

    if (!isExpiredDate(parseImageStoredAt(message), retentionDays, now)) {
      return message;
    }

    const next = { ...message };
    delete next.imagePath;
    delete next.imageStoredAt;
    return next;
  });
}

function createImageRetentionService({ config, conversationStore, imageStore }) {
  let cleanupInFlight = null;
  let timer = null;

  async function cleanupConversation(userId, now = new Date()) {
    if (!conversationStore.isConfigured || !imageStore.isConfigured) {
      return { deletedImageCount: 0 };
    }

    const conversation = await conversationStore.getConversation(userId);
    const expiredPaths = collectExpiredImagePaths(
      conversation.messages,
      config.supabaseImageRetentionDays,
      now
    );

    if (!expiredPaths.length) {
      return { deletedImageCount: 0 };
    }

    try {
      await imageStore.deleteImages(expiredPaths);
    } catch (error) {
      console.error(`Failed to delete expired images for ${userId}:`, error);
    }

    await conversationStore.updateConversation(
      userId,
      (current) => ({
        summary: current.summary,
        messages: stripExpiredImages(
          current.messages,
          config.supabaseImageRetentionDays,
          now
        ),
      }),
      {
        expectedSessionVersion: conversation.sessionVersion,
      }
    );

    return { deletedImageCount: expiredPaths.length };
  }

  async function runCleanupPass() {
    if (!conversationStore.isConfigured || !imageStore.isConfigured) {
      return;
    }

    if (cleanupInFlight) {
      return cleanupInFlight;
    }

    cleanupInFlight = (async () => {
      let from = 0;
      const pageSize = 100;

      while (true) {
        const conversations = await conversationStore.listConversationsPage({
          from,
          limit: pageSize,
        });

        if (!conversations.length) {
          break;
        }

        for (const conversation of conversations) {
          await cleanupConversation(conversation.userId);
        }

        if (conversations.length < pageSize) {
          break;
        }

        from += conversations.length;
      }
    })()
      .catch((error) => {
        console.error("Image retention cleanup failed:", error);
      })
      .finally(() => {
        cleanupInFlight = null;
      });

    return cleanupInFlight;
  }

  function start() {
    if (timer || config.imageCleanupIntervalMs <= 0) {
      return;
    }

    timer = setInterval(() => {
      void runCleanupPass();
    }, config.imageCleanupIntervalMs);

    if (typeof timer.unref === "function") {
      timer.unref();
    }
  }

  return {
    cleanupConversation,
    runCleanupPass,
    start,
  };
}

module.exports = { createImageRetentionService };
