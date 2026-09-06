import mongoose from 'mongoose';

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, default: '' },
    publicId: { type: String, default: '' },
  },
  { _id: false }
);

/** Singleton document — there is exactly one settings row, keyed 'general'. */
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'general', unique: true, immutable: true },

    siteName: { type: String, trim: true, default: 'Angelz Perfume', maxlength: 120 },
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

    // A single-location store turns branches off; every branch-aware screen then hides.
    features: {
      branches: { type: Boolean, default: true },
    },

    billing: {
      currency: { type: String, default: 'INR' },
      currencySymbol: { type: String, default: '₹' },
      billPrefix: { type: String, default: 'AP', uppercase: true, trim: true, maxlength: 6 },
      defaultTaxPercent: { type: Number, default: 0, min: 0, max: 100 },
      /**
       * The most a Billing Staff account may discount a line, and the most of a
       * bill they may write off with the whole-bill discount. Admins and above
       * can go past it; staff cannot, so a till operator can no longer hand out
       * stock for free at full stock deduction.
       */
      maxDiscountPercent: { type: Number, default: 20, min: 0, max: 100 },
      invoiceFooter: { type: String, default: 'Thank you for shopping with us.', maxlength: 300 },
      termsAndConditions: { type: String, default: '', maxlength: 2000 },
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedFields: { type: Map, of: Date, default: {} }, // powers the "Never updated" hints in the UI
  },
  { timestamps: true }
);

/** Always returns the singleton, creating it with defaults on first call. */
settingsSchema.statics.getSingleton = async function getSingleton() {
  const existing = await this.findOne({ key: 'general' });
  if (existing) return existing;
  return this.create({ key: 'general' });
};

/**
 * The same singleton, as a plain read-only object, cached in process.
 *
 * Every bill view and every printed slip needs the store identity, so
 * `getSingleton` was being queried on each one — a database round trip for a
 * document that changes maybe monthly, on one of the hottest read paths in the
 * app. This serves those readers from memory instead.
 *
 * It returns a LEAN object on purpose. `getSingleton` hands back a live
 * mongoose document that the settings controller mutates and saves, and a
 * shared cached copy of that is a bug waiting to happen — a caller could
 * quietly edit everyone else's settings in place. Writers keep using
 * `getSingleton`; readers use this and cannot mutate anything that matters.
 *
 * `invalidate` is called by the settings controller after every successful
 * write, so the staleness window is "until the next settings change", with the
 * TTL only as a backstop for a write that happened in another process.
 */
let cachedSettings = null;
let cachedAt = 0;
const SETTINGS_TTL_MS = 60_000;

settingsSchema.statics.getCached = async function getCached() {
  if (cachedSettings && Date.now() - cachedAt < SETTINGS_TTL_MS) return cachedSettings;

  const existing = await this.findOne({ key: 'general' }).lean();
  cachedSettings = existing || (await this.create({ key: 'general' })).toObject();
  cachedAt = Date.now();
  return cachedSettings;
};

settingsSchema.statics.invalidateCache = function invalidateCache() {
  cachedSettings = null;
  cachedAt = 0;
};

export const Settings = mongoose.model('Settings', settingsSchema);
export default Settings;
