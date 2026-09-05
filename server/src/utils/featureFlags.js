import Settings from '../models/Settings.js';

/**
 * Feature switches the request pipeline needs synchronously.
 *
 * `resolveBranchScope` and `assertBranchAccess` are plain synchronous helpers
 * called deep inside controllers and the dashboard cache key, so they cannot
 * await the settings document themselves. The flag is loaded once per request
 * by `attachFeatures` and cached here for a few seconds, because a settings read
 * on every request to answer one boolean is pure overhead — and `refreshFeatures`
 * clears it the moment the switch is flipped, so the window is "until the next
 * write", not a flat TTL.
 */
const TTL_MS = 15_000;

let cached = null;
let cachedAt = 0;

export const refreshFeatures = () => {
  cached = null;
  cachedAt = 0;
};

export const loadFeatures = async () => {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;

  const settings = await Settings.getSingleton();
  cached = { branches: settings.features?.branches !== false };
  cachedAt = Date.now();
  return cached;
};

/**
 * Puts the flags on the request before any route reads them. Fails open on a
 * settings read error: branch scoping stays on, which is the safe direction.
 */
export const attachFeatures = async (req, _res, next) => {
  try {
    req.features = await loadFeatures();
  } catch {
    req.features = { branches: true };
  }
  return next();
};

/** True unless the store has explicitly switched branch management off. */
export const branchesOn = (req) => req?.features?.branches !== false;

export default attachFeatures;
