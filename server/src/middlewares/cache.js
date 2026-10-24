import TtlCache from '../utils/TtlCache.js';
import { resolveBranchScope } from './authorize.js';
import { invalidateUser, clearUserCache } from '../utils/userCache.js';
import { broadcast, onBroadcast } from '../config/broadcast.js';

// Cache for the read-only analytics endpoints.
const dashboardCache = new TtlCache({ ttlMs: 30_000, maxEntries: 300 });

// All-time figures (not period-scoped).
export const lifetimeCache = new TtlCache({ ttlMs: 60 * 60_000, maxEntries: 50 });

// Catalogue reads that are not analytics.
export const catalogueCache = new TtlCache({ ttlMs: 10 * 60_000, maxEntries: 60 });

// The billing screen's type-ahead set.
export const lookupCache = new TtlCache({ ttlMs: 10 * 60_000, maxEntries: 4 });

/** Both go stale on the same writes, so they're cleared together. */
const bustCatalogueCaches = () => {
  catalogueCache.clear();
  lookupCache.clear();
  broadcast('catalogue');
};

export const dashboardCacheStats = () => dashboardCache.stats;

/** Every key for a scope starts with this, so eviction can target one scope. */
const scopePrefix = (scope) => `${scope || 'all'} :: `;

const bustLocally = (scope) => {
  if (scope === undefined) return dashboardCache.clear();
  return dashboardCache.deleteByPrefix([scopePrefix(scope), scopePrefix('all')]);
};

const bustDashboardCache = (scope) => {
  const removed = bustLocally(scope);
  // Tell other workers to evict their copies too. See config/broadcast.js.
  broadcast('dashboard', { scope: scope === undefined ? '__all__' : scope });
  return removed;
};

// Apply locally only; re-broadcasting would make workers evict each other forever.
onBroadcast('dashboard', (payload) =>
  bustLocally(payload?.scope === '__all__' ? undefined : payload?.scope)
);
onBroadcast('catalogue', () => {
  catalogueCache.clear();
  lookupCache.clear();
});

const keyFor = (req) => {
  const query = Object.keys(req.query)
    .sort()
    .map((key) => `${key}=${req.query[key]}`)
    .join('&');

  const scope = resolveBranchScope(req) || 'all';
  return `${scopePrefix(scope)}${req.baseUrl}${req.path}?${query} :: ${req.user?.role}`;
};

export const cacheResponse =
  ({ cache = dashboardCache, ttlMs } = {}) =>
  (req, res, next) => {
    if (req.method !== 'GET') return next();

    let key;
    try {
      key = keyFor(req);
    } catch {
      // resolveBranchScope throws for an account with no branch; let the controller handle it.
      return next();
    }

    res.set('Cache-Control', 'private, no-cache');

    const hit = cache.get(key);
    if (hit) {
      res.set('X-Cache', 'HIT');
      return res.status(200).json(hit);
    }

    res.set('X-Cache', 'MISS');
    const json = res.json.bind(res);
    res.json = (body) => {
      // Only cache successful responses.
      if (res.statusCode === 200 && body?.success) cache.set(key, body, ttlMs);
      return json(body);
    };
    return next();
  };

// Clears the dashboard cache after any successful write on this router.
export const invalidateDashboardOnWrite =
  ({ except = [], scoped = false, catalogue = false } = {}) =>
  (req, res, next) => {
    if (req.method === 'GET' || except.includes(req.path)) return next();

    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (catalogue) bustCatalogueCaches();

        let scope;
        if (scoped) {
          // Resolved after the write: an admin's scope is the branch the write landed in.
          try {
            scope = resolveBranchScope(req) || 'all';
          } catch {
            scope = undefined; // unknown scope — fall back to a full clear
          }
        }
        bustDashboardCache(scope);
      }
      return json(body);
    };
    return next();
  };

// Evicts the cached account after any successful write on this router.
export const invalidateAccountOnWrite =
  ({ target = 'param' } = {}) =>
  (req, res, next) => {
    if (req.method === 'GET') return next();

    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const id = target === 'self' ? req.user?._id || req.params?.id : req.params?.id || req.user?._id;
        invalidateUser(id);
      }
      return json(body);
    };
    return next();
  };

// Clears EVERY cached account after a successful write.
export const invalidateAllAccountsOnWrite = () => (req, res, next) => {
  if (req.method === 'GET') return next();

  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) clearUserCache();
    return json(body);
  };
  return next();
};
