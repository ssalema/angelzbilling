import TtlCache from '../utils/TtlCache.js';
import { resolveBranchScope } from './authorize.js';

/**
 * Response caching for the read-only analytics endpoints.
 *
 * The dashboard fires eight aggregations on every load and the figures barely
 * move between two loads seconds apart, so recomputing them per request is pure
 * waste — six staff with the page open costs the database forty-eight pipeline
 * runs a minute for numbers that are identical.
 *
 * Two things keep it honest:
 *  - the cache key LEADS with the caller's branch scope and role, so one branch
 *    is never served another branch's totals, and a write can evict exactly the
 *    scopes it touched (see `bustDashboardCache`);
 *  - every write that moves a figure (a bill, a refund, a stock or catalogue
 *    change, a staff account) evicts those scopes, so the staleness window is
 *    "until the next relevant write", not a flat thirty seconds.
 */
export const dashboardCache = new TtlCache({ ttlMs: 30_000, maxEntries: 300 });

/**
 * A second cache for figures that are all-time rather than period-scoped.
 *
 * The "total customers ever billed" aggregation groups the entire bills
 * collection with no date filter — it is the most expensive query in the app
 * and it cannot be narrowed, because the question really is "everyone, ever".
 * It is also the figure that moves least: one new customer changes it by one.
 * Holding it for an hour turns eight full scans a minute into one an hour, and
 * the worst case is a lifetime customer count that is up to an hour behind.
 *
 * It is deliberately NOT cleared by the write hook below — that is the entire
 * point of keeping it separate from `dashboardCache`.
 */
export const lifetimeCache = new TtlCache({ ttlMs: 60 * 60_000, maxEntries: 50 });

/** Every entry for one scope starts with this, which is what makes eviction surgical. */
const scopePrefix = (scope) => `${scope || 'all'} :: `;

/**
 * Evicts the cached analytics for the scopes a write actually affected.
 *
 * Always two of them: the branch the write happened at, and the all-branches
 * roll-up a Super Admin sees, which necessarily includes it. Every other
 * branch's figures are untouched by this write and stay cached.
 *
 * With no scope (a catalogue or staff change, which is store-wide) it falls
 * back to clearing everything, because those genuinely do move every branch's
 * numbers — a perfume going out of stock shows on all of them.
 */
export const bustDashboardCache = (scope) => {
  if (scope === undefined) return dashboardCache.clear();
  return dashboardCache.deleteByPrefix([scopePrefix(scope), scopePrefix('all')]);
};

const keyFor = (req) => {
  // Query values are already normalised by `validate`, so the defaults
  // (range=month) are present here and two requests that mean the same thing
  // hash to the same entry.
  const query = Object.keys(req.query)
    .sort()
    .map((key) => `${key}=${req.query[key]}`)
    .join('&');

  // `resolveBranchScope` is the same function the controllers filter on, so the
  // key cannot drift from the data it describes. Scope leads so eviction can
  // match on a prefix. Role is in the key as a safety margin: if a payload ever
  // becomes role-dependent it will not leak sideways.
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
      // resolveBranchScope throws for an account with no branch. That is the
      // controller's error to raise, not the cache's — pass it straight through.
      return next();
    }

    // Let the browser revalidate rather than hold a copy of its own: a 304 off
    // Express's ETag is nearly free and, unlike a browser-side max-age, it can
    // never survive a cache bust and show a biller their own bill missing.
    res.set('Cache-Control', 'private, no-cache');

    const hit = cache.get(key);
    if (hit) {
      res.set('X-Cache', 'HIT');
      return res.status(200).json(hit);
    }

    res.set('X-Cache', 'MISS');
    const json = res.json.bind(res);
    res.json = (body) => {
      // Only successful payloads are worth keeping; an error must be recomputed.
      if (res.statusCode === 200 && body?.success) cache.set(key, body, ttlMs);
      return json(body);
    };
    return next();
  };

/**
 * Clears the dashboard cache after any successful write on the router it is
 * mounted on.
 *
 * Mounted once per module rather than called at each controller's return: a
 * write added later is covered automatically, which is exactly the sort of
 * thing that gets forgotten when invalidation lives next to the response.
 *
 * `scoped` says the writes on this router belong to one branch (bills do), so
 * only that branch and the all-branches roll-up are evicted. Routers whose
 * writes are store-wide (perfumes, users, settings) leave it off and clear
 * everything, which is the honest answer for a catalogue change.
 *
 * `except` lists paths that use a write verb but change nothing — POST
 * /bills/preview is a costing calculation the biller triggers while typing, and
 * letting it bust the cache would keep the dashboard cold all day for no gain.
 */
export const invalidateDashboardOnWrite =
  ({ except = [], scoped = false } = {}) =>
  (req, res, next) => {
    if (req.method === 'GET' || except.includes(req.path)) return next();

    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        let scope;
        if (scoped) {
          // Resolved here rather than at request time: an admin's own scope is
          // the branch their write landed in.
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

export default cacheResponse;
