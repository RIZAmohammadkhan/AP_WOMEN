const crypto = require("crypto");

class AudioStore {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.items = new Map();
  }

  put({ buffer, contentType, extension }) {
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + this.ttlMs;

    this.items.set(token, {
      buffer,
      contentType,
      extension,
      expiresAt,
    });

    this.sweepExpired();

    return {
      token,
      extension,
    };
  }

  get(token) {
    const item = this.items.get(token);

    if (!item) {
      return null;
    }

    if (item.expiresAt <= Date.now()) {
      this.items.delete(token);
      return null;
    }

    return item;
  }

  sweepExpired() {
    const now = Date.now();

    for (const [token, item] of this.items.entries()) {
      if (item.expiresAt <= now) {
        this.items.delete(token);
      }
    }
  }
}

module.exports = { AudioStore };
