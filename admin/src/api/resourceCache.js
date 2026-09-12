// Read payloads held between mounts, so going back to a screen is instant.

const store = new Map();

/** A bound on the map, so a long session cannot grow it without limit. */
const MAX_ENTRIES = 60;

// How long a cached payload may be shown before a screen waits for fresh data.
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
  // Re-inserting moves the key to the end of the Map's insertion order, which is
  // what makes the eviction below oldest-first rather than arbitrary.
  if (store.has(key)) store.delete(key);
  store.set(key, { value, at: Date.now() });
  while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value);
};

// Drops cached reads. A screen names a slice of a resource ('perfumes:list'),
// and a write to 'perfumes' drops every slice of it as well as the whole.
export const clearResourceCache = (name) => {
  if (!name) return store.clear();
  for (const key of [...store.keys()]) {
    const end = key.indexOf(' :: ');
    const owner = end === -1 ? key : key.slice(0, end);
    if (owner === name || owner.startsWith(`${name}:`)) store.delete(key);
  }
};

export default store;
