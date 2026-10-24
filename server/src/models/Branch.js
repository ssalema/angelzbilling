import mongoose from 'mongoose';

const branchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Branch name is required'],
      trim: true,
      maxlength: [120, 'Branch name cannot exceed 120 characters'],
    },
    code: {
      type: String,
      required: [true, 'Branch code is required'],
      trim: true,
      uppercase: true,
      unique: true,
      minlength: [2, 'Branch code must be at least 2 characters'],
      maxlength: [10, 'Branch code cannot exceed 10 characters'],
    },
    address: {
      line1: { type: String, trim: true, default: '' },
      city: { type: String, trim: true, default: '' },
      state: { type: String, trim: true, default: '' },
      pincode: { type: String, trim: true, default: '' },
      country: { type: String, trim: true, default: 'India' },
    },
    phone: { type: String, trim: true, default: '' },
    phoneCountryCode: { type: String, trim: true, default: '+91' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    gstin: { type: String, trim: true, uppercase: true, default: '' },
    isActive: { type: Boolean, default: true },

    // Set when branch management is turned off, so turning it back on restores only
    // these branches (not ones deactivated by hand).
    deactivatedByFeature: { type: Boolean, default: false },

    // When off, the branch uses the store's branding.
    hasOwnLogo: { type: Boolean, default: false },
    logo: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    favicon: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

branchSchema.index({ isActive: 1 });
branchSchema.index({ name: 'text', code: 'text' });

/** '' means the branch uses the store's logo. */
branchSchema.virtual('effectiveLogo').get(function effectiveLogo() {
  return this.hasOwnLogo ? this.logo?.url || '' : '';
});

branchSchema.virtual('effectiveFavicon').get(function effectiveFavicon() {
  return this.hasOwnLogo ? this.favicon?.url || '' : '';
});

branchSchema.virtual('fullAddress').get(function fullAddress() {
  const { line1, city, state, pincode, country } = this.address || {};
  return [line1, city, state, pincode, country].filter(Boolean).join(', ');
});

export const Branch = mongoose.model('Branch', branchSchema);
export default Branch;
