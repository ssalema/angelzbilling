import mongoose from 'mongoose';
import { broadcast, onBroadcast } from '../config/broadcast.js';

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, default: '' },
    publicId: { type: String, default: '' },
  },
  { _id: false }
);

// Staff discount cap while the admin has not set one: staff cannot discount, never "no cap".
export const DEFAULT_MAX_DISCOUNT_PERCENT = 0;

// Singleton: exactly one settings document, keyed 'general'.
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'general', unique: true, immutable: true },

    siteName: { type: String, trim: true, default: '', maxlength: 120 },
    tagline: { type: String, trim: true, default: '', maxlength: 200 },
    contactEmail: { type: String, trim: true, lowercase: true, default: '' },
    contactNumber: { type: String, trim: true, default: '' },
    contactNumberCountryCode: { type: String, trim: true, default: '+91' },
    companyAddress: { type: String, trim: true, default: '', maxlength: 500 },
    gstin: { type: String, trim: true, uppercase: true, default: '' },

    branding: {
      logo: { type: imageSchema, default: () => ({}) },
      favicon: { type: imageSchema, default: () => ({}) },
    },

    social: {
      instagram: { type: String, trim: true, default: '' },
      facebook: { type: String, trim: true, default: '' },
      twitter: { type: String, trim: true, default: '' },
      linkedin: { type: String, trim: true, default: '' },
    },

    // Off for single-location stores; hides branch screens. A fresh store has
    // no branches, so it starts off; adding the first branch turns it on.
    features: {
      branches: { type: Boolean, default: false },
    },

    billing: {
      currency: { type: String, default: '' },
      currencySymbol: { type: String, default: '' },
      billPrefix: { type: String, default: '', uppercase: true, trim: true, maxlength: 6 },
      defaultTaxPercent: { type: Number, default: 0, min: 0, max: 100 },
      maxDiscountPercent: { type: Number, default: null, min: 0, max: 100 },
      invoiceFooter: { type: String, default: '', maxlength: 300 },
      termsAndConditions: { type: String, default: '', maxlength: 2000 },
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedFields: { type: Map, of: Date, default: {} }, // powers the "Never updated" hints in the UI
  },
  { timestamps: true }
);

const upsertSingleton = async (model, { lean = false } = {}) => {
  const query = { key: 'general' };
  try {
    const doc = await model
      .findOneAndUpdate(query, { $setOnInsert: query }, { new: true, upsert: true, setDefaultsOnInsert: true })
      .lean(lean);
    if (doc) return doc;
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }
  // Another request created it at the same time; read theirs.
  return model.findOne(query).lean(lean);
};

settingsSchema.statics.getSingleton = function getSingleton() {
  return upsertSingleton(this);
};

// In-process cache of the singleton as a plain object.
let cachedSettings = null;
let cachedAt = 0;
const SETTINGS_TTL_MS = 60_000;

settingsSchema.statics.getCached = async function getCached() {
  if (cachedSettings && Date.now() - cachedAt < SETTINGS_TTL_MS) return cachedSettings;

  // Lean so callers can't mutate a shared document.
  cachedSettings = await upsertSingleton(this, { lean: true });
  cachedAt = Date.now();
  return cachedSettings;
};

settingsSchema.statics.invalidateCache = function invalidateCache({ local = false } = {}) {
  cachedSettings = null;
  cachedAt = 0;
  if (!local) broadcast('settings');
};

export const Settings = mongoose.model('Settings', settingsSchema);
export default Settings;

// From another worker: clear locally without re-broadcasting.
onBroadcast('settings', () => Settings.invalidateCache({ local: true }));
