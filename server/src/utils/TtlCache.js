/**
 * A tiny in-process TTL cache.
 *
 * Deliberately not Redis: the only thing cached today is dashboard analytics,
 * which is cheap to recompute and safe to serve slightly stale. A per-instance
 * Map costs nothing to run and cannot fail the request. If a second API
 * instance is ever added, each keeps its own copy — the worst case is that two
 * users see figures up to `ttlMs` apart, which is the same guarantee a single
 * instance already gives.
 *
 * Entries expire lazily on read. `maxEntries` is the real memory ceiling: once
 * it is hit the oldest insertion is evicted, so a caller that varies the query
 * string endlessly cannot grow the map without bound.
 */
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

  /** Drops everything. Called when the underlying data changes. */
  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}
