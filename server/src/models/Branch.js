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
    isDefault: { type: Boolean, default: false },

    // Set when branch management itself was switched off, so switching it back
    // on restores exactly these branches and leaves manual deactivations alone.
    deactivatedByFeature: { type: Boolean, default: false },

    // A branch may print under its own logo; when off it inherits the store logo.
    hasOwnLogo: { type: Boolean, default: false },
    logo: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

branchSchema.index({ isActive: 1 });
branchSchema.index({ name: 'text', code: 'text' });

/** '' means the branch inherits the store logo — the single place that rule lives. */
branchSchema.virtual('effectiveLogo').get(function effectiveLogo() {
  return this.hasOwnLogo ? this.logo?.url || '' : '';
});

branchSchema.virtual('fullAddress').get(function fullAddress() {
  const { line1, city, state, pincode, country } = this.address || {};
  return [line1, city, state, pincode, country].filter(Boolean).join(', ');
});

/** Only one branch can carry the default flag. */
branchSchema.pre('save', async function ensureSingleDefault(next) {
  if (this.isDefault && this.isModified('isDefault')) {
    await this.constructor.updateMany({ _id: { $ne: this._id } }, { $set: { isDefault: false } });
  }
  next();
});

export const Branch = mongoose.model('Branch', branchSchema);
export default Branch;
