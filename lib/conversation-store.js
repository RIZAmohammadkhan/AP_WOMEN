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
    this.writeQueue = Promise.resolve();
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
      .select("summary, messages, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Failed to load conversation from Supabase: ${error.message}. If this is a new project, run supabase/schema.sql first.`
      );
    }

    return this.normalizeConversation(data);
  }

  async updateConversation(userId, updater) {
    this.ensureConfigured();

    this.writeQueue = this.writeQueue.catch(() => {}).then(async () => {
      const current = await this.getConversation(userId);
      const next = await updater(current);
      const updatedAt = new Date().toISOString();

      const payload = {
        user_id: userId,
        summary: typeof next.summary === "string" ? next.summary : "",
        messages: Array.isArray(next.messages)
          ? next.messages.map(normalizeMessage).filter(Boolean)
          : [],
        updated_at: updatedAt,
      };

      const { data, error } = await this.client
        .from(this.tableName)
        .upsert(payload, { onConflict: "user_id" })
        .select("summary, messages, updated_at")
        .maybeSingle();

      if (error) {
        throw new Error(
          `Failed to save conversation to Supabase: ${error.message}. If this is a new project, run supabase/schema.sql first.`
        );
      }

      return this.normalizeConversation(data || payload);
    });

    return this.writeQueue;
  }

  async clearConversation(userId) {
    this.ensureConfigured();

    const current = await this.getConversation(userId);

    const { error } = await this.client
      .from(this.tableName)
      .delete()
      .eq("user_id", userId);

    if (error) {
      throw new Error(
        `Failed to clear conversation in Supabase: ${error.message}.`
      );
    }

    return current;
  }

  async listConversationsPage({ from = 0, limit = 100 } = {}) {
    this.ensureConfigured();

    const to = from + limit - 1;
    const { data, error } = await this.client
      .from(this.tableName)
      .select("user_id, summary, messages, updated_at")
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
