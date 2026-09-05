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
 *  - the cache key carries the caller's branch scope and role, so one branch is
 *    never served another branch's totals out of the cache;
 *  - every write that moves a figure (a bill, a refund, a stock or catalogue
 *    change, a staff account) clears the cache outright, so the staleness window
 *    is "until the next relevant write", not a flat thirty seconds.
 */
export const dashboardCache = new TtlCache({ ttlMs: 30_000, maxEntries: 300 });

export const bustDashboardCache = () => dashboardCache.clear();

const keyFor = (req) => {
  // Query values are already normalised by `validate`, so the defaults
  // (range=month) are present here and two requests that mean the same thing
  // hash to the same entry.
  const query = Object.keys(req.query)
    .sort()
    .map((key) => `${key}=${req.query[key]}`)
    .join('&');

  // `resolveBranchScope` is the same function the controllers filter on, so the
  // key cannot drift from the data it describes. Role is in the key as a safety
  // margin: if a payload ever becomes role-dependent it will not leak sideways.
  const scope = resolveBranchScope(req) || 'all';
  return `${req.baseUrl}${req.path}?${query} :: ${scope} :: ${req.user?.role}`;
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
 * `except` lists paths that use a write verb but change nothing — POST
 * /bills/preview is a costing calculation the biller triggers while typing, and
 * letting it bust the cache would keep the dashboard cold all day for no gain.
 */
export const invalidateDashboardOnWrite =
  ({ except = [] } = {}) =>
  (req, res, next) => {
    if (req.method === 'GET' || except.includes(req.path)) return next();

    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) bustDashboardCache();
      return json(body);
    };
    return next();
  };

export default cacheResponse;
