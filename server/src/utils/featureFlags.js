import Settings from '../models/Settings.js';
import Branch from '../models/Branch.js';
import { broadcast, onBroadcast } from '../config/broadcast.js';
import { emit } from '../config/socket.js';

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

/**
 * Branch mode is on only while at least one branch is active. Run after any
 * branch write, at boot and on sign-in, so a fresh database (or one changed by
 * hand) never reports branch mode on with no branches behind it.
 */
export const syncBranchesFeature = async () => {
  const active = await Branch.countDocuments({ isActive: true });

  const settings = await Settings.getSingleton();
  const current = settings.features?.branches !== false;
  const next = active > 0;
  if (current === next) return false;

  settings.set('features.branches', next);
  // Mongoose Map keys can't contain dots, so use ':' (same as the settings controller).
  settings.updatedFields.set('features:branches', new Date());
  await settings.save();

  refreshFeatures();
  Settings.invalidateCache();

  // Open tabs re-read settings, so branch columns and chips follow the flag.
  const knock = { resource: 'settings', action: 'changed', id: null, data: null, at: new Date().toISOString() };
  emit('settings:changed', knock);
  emit('resource:changed', knock);
  return true;
};
