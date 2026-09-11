// A tiny in-process TTL cache.
export default class TtlCache {
  constructor({ ttlMs = 30_000, maxEntries = 200 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.store = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    return entry.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    // Re-inserting moves the key to the end of the Map's insertion order, which
    // is what makes the eviction below oldest-first rather than arbitrary.
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });

    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      this.store.delete(oldest);
    }
  }

  /** Drops one key. Returns true if there was something there to drop. */
  delete(key) {
    return this.store.delete(key);
  }

  /** Drops everything. The blunt instrument — prefer `deleteByPrefix`. */
  clear() {
    this.store.clear();
  }

  // Drops only the entries whose key starts with one of `prefixes`.
  deleteByPrefix(prefixes = []) {
    const list = Array.isArray(prefixes) ? prefixes : [prefixes];
    if (!list.length) return 0;

    let removed = 0;
    for (const key of this.store.keys()) {
      if (list.some((prefix) => key.startsWith(prefix))) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  /** Hit rate as a 0-1 fraction, for logging or a health endpoint. */
  get stats() {
    const total = this.hits + this.misses;
    return { hits: this.hits, misses: this.misses, size: this.store.size, hitRate: total ? this.hits / total : 0 };
  }

  get size() {
    return this.store.size;
  }
}
