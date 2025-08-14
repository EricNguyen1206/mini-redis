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
    let removed = 0;
    for (const key of keys) {
      if (this.store.delete(key)) {
        removed++;
        this._clearExpiration(key);
      }
    }
    return removed;
  }

  expire(key, seconds, onExpire) {
    if (!this.store.has(key)) return 0;
    this._clearExpiration(key);
    const handle = setTimeout(() => {
      this.store.delete(key);
      this.expirations.delete(key);
      if (typeof onExpire === "function") onExpire(key);
    }, seconds * 1000);
    this.expirations.set(key, handle);
    return 1;
  }

  _clearExpiration(key) {
    const h = this.expirations.get(key);
    if (h) {
      clearTimeout(h);
      this.expirations.delete(key);
    }
  }
}

module.exports = MiniRedisStore;
