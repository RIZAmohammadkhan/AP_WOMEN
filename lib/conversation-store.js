const fs = require("fs");
const path = require("path");

class ConversationStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
    this.ensureStoreFile();
  }

  ensureStoreFile() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, "{}\n", "utf8");
    }
  }

  createEmptyConversation() {
    return {
      summary: "",
      messages: [],
      updatedAt: new Date().toISOString(),
    };
  }

  readStore() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      if (!raw.trim()) {
        return {};
      }

      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      console.error("Failed to read conversation store, using empty store:", error);
      return {};
    }
  }

  async getConversation(userId) {
    const store = this.readStore();
    const conversation = store[userId];

    if (!conversation || typeof conversation !== "object") {
      return this.createEmptyConversation();
    }

    return {
      summary: typeof conversation.summary === "string" ? conversation.summary : "",
      messages: Array.isArray(conversation.messages) ? conversation.messages : [],
      updatedAt:
        typeof conversation.updatedAt === "string"
          ? conversation.updatedAt
          : new Date().toISOString(),
    };
  }

  async updateConversation(userId, updater) {
    this.writeQueue = this.writeQueue.then(async () => {
      const store = this.readStore();
      const current = store[userId] || this.createEmptyConversation();
      const next = await updater({
        summary: typeof current.summary === "string" ? current.summary : "",
        messages: Array.isArray(current.messages) ? current.messages : [],
        updatedAt: current.updatedAt || new Date().toISOString(),
      });

      store[userId] = {
        summary: typeof next.summary === "string" ? next.summary : "",
        messages: Array.isArray(next.messages) ? next.messages : [],
        updatedAt: new Date().toISOString(),
      };

      fs.writeFileSync(this.filePath, JSON.stringify(store, null, 2) + "\n", "utf8");
      return store[userId];
    });

    return this.writeQueue;
  }
}

module.exports = { ConversationStore };
