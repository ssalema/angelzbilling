import TtlCache from './TtlCache.js';
import { broadcast, onBroadcast } from '../config/broadcast.js';

const TTL_MS = 15_000;

const cache = new TtlCache({ ttlMs: TTL_MS, maxEntries: 1000 });

/** Extra listeners notified on eviction — the cluster bridge registers here. */
const listeners = new Set();

const onUserCacheEvict = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const announce = (userId) => listeners.forEach((listener) => listener(userId));

export const getCachedUser = (userId) => cache.get(String(userId));

export const setCachedUser = (userId, user) => cache.set(String(userId), user);

// Drops one account, and tells anyone listening to do the same.
export const invalidateUser = (userId, { local = false } = {}) => {
  if (!userId) return;
  cache.delete(String(userId));
  if (!local) announce(String(userId));
};

// Drops every account.
export const clearUserCache = ({ local = false } = {}) => {
  cache.clear();
  if (!local) announce(null);
};

onUserCacheEvict((userId) => broadcast('account', { userId }));

onBroadcast('account', (payload) => {
  if (payload?.userId) invalidateUser(payload.userId, { local: true });
  else clearUserCache({ local: true });
});

export const userCacheStats = () => cache.stats;

export default cache;
