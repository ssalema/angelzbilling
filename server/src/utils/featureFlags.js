import Settings from '../models/Settings.js';
import { broadcast, onBroadcast } from '../config/broadcast.js';

// Feature flags are cached per process for this long.
const TTL_MS = 15_000;

let cached = null;
let cachedAt = 0;

export const refreshFeatures = ({ local = false } = {}) => {
  cached = null;
  cachedAt = 0;
  // Tell other workers too, or they would scope branches with a stale flag.
  if (!local) broadcast('features');
};

onBroadcast('features', () => refreshFeatures({ local: true }));

const loadFeatures = async () => {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;

  const settings = await Settings.getSingleton();
  cached = { branches: settings.features?.branches !== false };
  cachedAt = Date.now();
  return cached;
};

export const attachFeatures = async (req, _res, next) => {
  try {
    req.features = await loadFeatures();
  } catch {
    req.features = { branches: true };
  }
  return next();
};

// On unless explicitly switched off.
export const branchesOn = (req) => req?.features?.branches !== false;
