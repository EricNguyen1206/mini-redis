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
    const list = Array.isArray(keys)
      ? keys
      : typeof keys === "string" || keys == null || typeof keys[Symbol.iterator] !== "function"
      ? [keys]
      : Array.from(keys);
    let removed = 0;
    for (const key of list) {
      if (this.store.delete(key)) {
        removed++;
      }
  expire(key, seconds, onExpire) {
    if (!this.store.has(key)) return 0;
    const msRaw = Number(seconds) * 1000;
    const ms = Number.isFinite(msRaw) ? Math.max(0, msRaw) : 0;
    this._clearExpiration(key);
    const handle = setTimeout(() => {
      this.store.delete(key);
      this.expirations.delete(key);
      if (typeof onExpire === "function") {
        try {
          onExpire(key);
        } catch {
          // Swallow errors to avoid crashing the process on expiration callback
        }
      }
    }, ms);
    if (typeof handle?.unref === "function") handle.unref();
    this.expirations.set(key, handle);
    return 1;
  }
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
