// Caches read payloads between mounts so returning to a screen is instant.

const store = new Map();

/** Cap so a long session cannot grow the cache without limit. */
const MAX_ENTRIES = 60;

// After this, a cached payload is dropped and the screen waits for fresh data.
const STALE_AFTER_MS = 60_000;

export const keyFor = (name, deps) => `${name} :: ${JSON.stringify(deps)}`;

export const readResource = (key) => {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at > STALE_AFTER_MS) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
};

export const writeResource = (key, value) => {
  // Re-insert to move the key to the end, so eviction below is oldest-first.
  if (store.has(key)) store.delete(key);
  store.set(key, { value, at: Date.now() });
  while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value);
};

// Clearing 'perfumes' also clears its slices like 'perfumes:list'.
export const clearResourceCache = (name) => {
  if (!name) return store.clear();
  for (const key of [...store.keys()]) {
    const end = key.indexOf(' :: ');
    const owner = end === -1 ? key : key.slice(0, end);
    if (owner === name || owner.startsWith(`${name}:`)) store.delete(key);
  }
};

export default store;
