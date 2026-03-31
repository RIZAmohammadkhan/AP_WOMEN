function normalizeMessage(message) {
  if (!message || typeof message !== "object") {
    return null;
  }

  const role = message.role === "assistant" ? "assistant" : "user";
  const legacyText = typeof message.content === "string" ? message.content : "";
  const text = typeof message.text === "string" ? message.text : legacyText;
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

class ConversationStore {
  constructor({ config, supabaseClient }) {
    this.config = config;
    this.client = supabaseClient;
    this.tableName = config.supabaseConversationsTable;
    this.writeQueues = new Map();
    this.isConfigured = Boolean(
      supabaseClient &&
        config.supabaseUrl &&
        config.supabaseServiceRoleKey &&
        config.supabaseConversationsTable
    );
  }

  createEmptyConversation() {
    return {
      summary: "",
      messages: [],
      sessionVersion: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  ensureConfigured() {
    if (!this.isConfigured) {
      throw new Error(
        "Supabase conversation storage is not configured. Please add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
      );
    }
  }

  normalizeConversation(row) {
    if (!row || typeof row !== "object") {
      return this.createEmptyConversation();
    }

    return {
      summary: typeof row.summary === "string" ? row.summary : "",
      messages: Array.isArray(row.messages)
        ? row.messages.map(normalizeMessage).filter(Boolean)
        : [],
      sessionVersion:
        Number.isSafeInteger(row.session_version) && row.session_version >= 0
          ? row.session_version
          : Number.isSafeInteger(row.sessionVersion) && row.sessionVersion >= 0
            ? row.sessionVersion
            : 0,
      updatedAt:
        typeof row.updated_at === "string"
          ? row.updated_at
          : typeof row.updatedAt === "string"
            ? row.updatedAt
            : new Date().toISOString(),
    };
  }

  async getConversation(userId) {
    this.ensureConfigured();

    const { data, error } = await this.client
      .from(this.tableName)
      .select("summary, messages, session_version, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Failed to load conversation from Supabase: ${error.message}. If this is a new project, run supabase/schema.sql first.`
      );
    }

    return this.normalizeConversation(data);
  }

  enqueueUserWrite(userId, task) {
    const previous = this.writeQueues.get(userId) || Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    const tracked = next.finally(() => {
      if (this.writeQueues.get(userId) === tracked) {
        this.writeQueues.delete(userId);
      }
    });
    this.writeQueues.set(userId, tracked);
    return next;
  }

  async updateConversation(userId, updater, options = {}) {
    this.ensureConfigured();

    return this.enqueueUserWrite(userId, async () => {
      const current = await this.getConversation(userId);
      const expectedSessionVersion = options.expectedSessionVersion;

      if (
        Number.isSafeInteger(expectedSessionVersion) &&
        current.sessionVersion !== expectedSessionVersion
      ) {
        return {
          status: "stale_after_reset",
          conversation: current,
        };
      }

      const next = await updater(current);
      const updatedAt = new Date().toISOString();
      const payload = {
        user_id: userId,
        summary: typeof next.summary === "string" ? next.summary : "",
        messages: Array.isArray(next.messages)
          ? next.messages.map(normalizeMessage).filter(Boolean)
          : [],
        session_version:
          Number.isSafeInteger(next.sessionVersion) && next.sessionVersion >= 0
            ? next.sessionVersion
            : current.sessionVersion,
        updated_at: updatedAt,
      };

      const { data, error } = await this.client
        .from(this.tableName)
        .upsert(payload, { onConflict: "user_id" })
        .select("summary, messages, session_version, updated_at")
        .maybeSingle();

      if (error) {
        throw new Error(
          `Failed to save conversation to Supabase: ${error.message}. If this is a new project, run supabase/schema.sql first.`
        );
      }

      return {
        status: "updated",
        conversation: this.normalizeConversation(data || payload),
      };
    });
  }

  async resetConversation(userId) {
    this.ensureConfigured();

    return this.enqueueUserWrite(userId, async () => {
      const current = await this.getConversation(userId);
      const updatedAt = new Date().toISOString();
      const payload = {
        user_id: userId,
        summary: "",
        messages: [],
        session_version: current.sessionVersion + 1,
        updated_at: updatedAt,
      };

      const { data, error } = await this.client
        .from(this.tableName)
        .upsert(payload, { onConflict: "user_id" })
        .select("summary, messages, session_version, updated_at")
        .maybeSingle();

      if (error) {
        throw new Error(
          `Failed to reset conversation in Supabase: ${error.message}.`
        );
      }

      return {
        clearedConversation: current,
        conversation: this.normalizeConversation(data || payload),
      };
    });
  }

  async clearConversation(userId) {
    const result = await this.resetConversation(userId);
    return result.clearedConversation;
  }

  async listConversationsPage({ from = 0, limit = 100 } = {}) {
    this.ensureConfigured();

    const to = from + limit - 1;
    const { data, error } = await this.client
      .from(this.tableName)
      .select("user_id, summary, messages, session_version, updated_at")
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(
        `Failed to list conversations from Supabase: ${error.message}.`
      );
    }

    return (data || []).map((row) => ({
      userId: row.user_id,
      ...this.normalizeConversation(row),
    }));
  }
}

module.exports = { ConversationStore };
