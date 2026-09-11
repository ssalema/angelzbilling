import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const ROLES = ['superadmin', 'admin', 'staff'];

const ROLE_LABELS = {
  superadmin: 'Super Admin',
  admin: 'Branch Admin',
  staff: 'Billing Staff',
};

// The human name for a role, as a plain function.
export const roleLabelFor = (role) => ROLE_LABELS[role] || role;

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      unique: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // never leaks through a plain find()
    },
    phone: { type: String, trim: true, default: '' },
    phoneCountryCode: { type: String, trim: true, default: '+91' },
    role: { type: String, enum: ROLES, default: 'staff', index: true },
    // The branch this account belongs to; null means the whole store.
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    avatar: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    // Per-account brute-force brake.
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },
    refreshTokens: { type: [refreshTokenSchema], default: [], select: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.password;
        delete ret.refreshTokens;
        return ret;
      },
    },
  }
);

userSchema.index({ branch: 1, isActive: 1 });
userSchema.index({ name: 'text', email: 'text' });

userSchema.virtual('roleLabel').get(function roleLabel() {
  return ROLE_LABELS[this.role] || this.role;
});

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) this.passwordChangedAt = new Date();
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

/** Read access. Every superadmin can look at every branch, assigned or not. */
userSchema.methods.hasBranchAccess = function hasBranchAccess(branchId) {
  if (this.role === 'superadmin' || !this.branch) return true;
  return String(this.branch._id || this.branch) === String(branchId);
};

export const User = mongoose.model('User', userSchema);
export default User;
