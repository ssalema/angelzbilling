import Settings from '../models/Settings.js';
import { broadcast, onBroadcast } from '../config/broadcast.js';

// Feature switches the request pipeline needs synchronously.
const TTL_MS = 15_000;

let cached = null;
let cachedAt = 0;

export const refreshFeatures = ({ local = false } = {}) => {
  cached = null;
  cachedAt = 0;
  // Branch scoping is switched on and off by this flag, so a worker still holding
  // the old value would scope a request the other way. See config/broadcast.js.
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

// Puts the flags on the request before any route reads them.
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
