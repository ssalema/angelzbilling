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

export const Settings = mongoose.model('Settings', settingsSchema);
export default Settings;
