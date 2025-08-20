/** In-memory store with TTL support via timers */
class MiniRedisStore {
  constructor() {
    this.store = new Map(); // key -> string
    this.expirations = new Map(); // key -> timeout handle
  }

  set(key, value) {
    this._clearExpiration(key);
    this.store.set(key, value);
  }

  get(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  del(keys) {
    let list;
    if (Array.isArray(keys)) {
      list = keys;
    } else if (typeof keys === "string" || keys == null || typeof keys[Symbol.iterator] !== "function") {
      list = [keys];
    } else {
      list = Array.from(keys);
    }
    let removed = 0;
    for (const key of list) {
      if (this.store.delete(key)) {
        removed++;
      }
      // Always attempt to clear any pending expiration for robustness
      this._clearExpiration(key);
    }
    return removed;
  }

  expire(key, seconds, onExpire) {
    if (!this.store.has(key)) return 0;
    const msRaw = Number(seconds) * 1000;
    const ms = Number.isFinite(msRaw) ? Math.max(0, msRaw) : 0;
    this._clearExpiration(key);
    const handle = setTimeout(() => {
      this.store.delete(key);
      this.expirations.delete(key);
      if (typeof onExpire === "function") onExpire(key);
    }, ms);
    this.expirations.set(key, { handle, expireAt: Date.now() + ms });
    return 1;
  }

  ttl(key) {
    if (!this.store.has(key)) return -2; // Key doesn't exist
    const expiration = this.expirations.get(key);
    if (!expiration) return -1; // Key exists but has no expiration
    const remaining = Math.max(0, expiration.expireAt - Date.now());
    return Math.ceil(remaining / 1000); // Return seconds
  }

  keys(pattern = "*") {
    const allKeys = Array.from(this.store.keys());
    if (pattern === "*") {
      return allKeys;
    }

    // Simple pattern matching - convert Redis pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")
      .replace(/\[([^\]]+)\]/g, "[$1]");

    const regex = new RegExp(`^${regexPattern}$`);
    return allKeys.filter((key) => regex.test(key));
  }

  _clearExpiration(key) {
    const expiration = this.expirations.get(key);
    if (expiration) {
      clearTimeout(expiration.handle || expiration); // Support both old and new format
      this.expirations.delete(key);
    }
  }
}

module.exports = MiniRedisStore;
