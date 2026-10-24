// Fallback staff discount cap. Must match DEFAULT_MAX_DISCOUNT_PERCENT on the server.
export const DEFAULT_MAX_DISCOUNT_PERCENT = 20;

export const HEAD_OFFICE = { id: 'head-office', name: 'Head Office', code: 'HO', isHeadOffice: true };

// A null branch means Head Office.
export const locationOf = (branch) => (branch?.id ? branch : HEAD_OFFICE);

export const locationLabel = (branch) => locationOf(branch).name;

// e.g. "Testing (TB)". The server words location changes the same way.
export const locationFullLabel = (branch) => {
  const location = locationOf(branch);
  return location.code ? `${location.name} (${location.code})` : location.name;
};

// Head Office first, then the branches.
export const locationOptions = (branches = []) => [
  HEAD_OFFICE,
  ...branches.map((branch) => ({ ...branch, isHeadOffice: false })),
];

export const ROLES = [
  { value: 'superadmin', label: 'Super Admin', description: 'Full access to every branch, user and setting' },
  { value: 'admin', label: 'Branch Admin', description: 'Manages perfumes, billing and reports for one branch' },
  { value: 'staff', label: 'Billing Staff', description: 'Creates bills and views the catalogue for one branch' },
];

export const ROLE_LABELS = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash', icon: 'payments' },
  { value: 'upi', label: 'UPI', icon: 'qr_code' },
  { value: 'card', label: 'Card', icon: 'credit_card' },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: 'account_balance' },
];

export const PAYMENT_METHOD_LABELS = Object.fromEntries(PAYMENT_METHODS.map((p) => [p.value, p.label]));

export const BILL_STATUSES = [
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Pending' },
  { value: 'refunded', label: 'Refunded' },
];

export const PAYMENT_TERMS = [
  { value: 'full', label: 'Full Paid', description: 'The customer settles the whole bill now' },
  { value: 'partial', label: 'Partial Paid', description: 'Part now, the balance collected later' },
];

export const PERFUME_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

// One-click size presets in the wizard.
export const PERFUME_SIZES = ['25gm', '50gm', '100gm', '250gm', '500gm', '1000gm'];

export const FRAGRANCE_FAMILIES = [
  'Floral',
  'Woody',
  'Oriental',
  'Fresh',
  'Citrus',
  'Musky',
  'Smoky',
  'Spicy',
  'Gourmand',
];

export const CONCENTRATIONS = [
  'Pure Attar',
  'Perfume Oil',
  'EDP — Eau de Parfum',
  'EDT — Eau de Toilette',
  'EDC — Eau de Cologne',
  'Roll On',
  'Body Mist',
  'Incense',
];

export const CHART_METRICS = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'bills', label: 'Bills' },
  { value: 'customers', label: 'Customers' },
  { value: 'aov', label: 'AOV' },
];

export const SELECTOR_STYLES = [
  { value: 'automatic', label: 'Automatic' },
  { value: 'chip', label: 'Chip' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'swatch', label: 'Swatch' },
];

export const ROWS_PER_PAGE = [10, 25, 50, 100];

export const IMAGE_TYPES = 'image/jpeg,image/jpg,image/pjpeg,.jfif,image/png,image/gif,image/webp';

// Same per-file cap as the server and Cloudinary.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'jpe', 'jfif', 'png', 'gif', 'webp'];

// Windows often gives .jfif and similar files a blank type, so fall back to the
// extension. The server checks the real bytes.
const looksLikeImage = (file) => {
  if (file?.type?.startsWith('image/')) return true;
  const name = file?.name || '';
  return IMAGE_EXTENSIONS.includes(name.split('.').pop()?.toLowerCase());
};

// Returns why an image is rejected, or null if it's fine.
export const rejectImageReason = (file) => {
  if (!looksLikeImage(file)) return 'That is not an image — pick a JPEG, PNG, WEBP or GIF.';
  if (file.size > MAX_UPLOAD_BYTES) return 'That image is over 5MB. Save a smaller copy and try again.';
  return null;
};

export const PASSWORD_HINT =
  'At least 8 characters with an uppercase letter, a lowercase letter and a number';

// Sign-in page notices for why a session ended. `error` is for cases where
// signing in again will also be refused.
export const SESSION_NOTICE = {
  expired: { message: 'Your session expired. Please sign in again.', severity: 'warning' },
  ended: { message: 'Your session has ended. Please sign in again.', severity: 'info' },
  passwordChanged: {
    message: 'Your password was changed. Please sign in with your new password.',
    severity: 'info',
  },
  // Same wording the server sends when an account or branch is deactivated.
  deactivated: {
    message: 'Your account has been deactivated. Please contact the super admin.',
    severity: 'error',
  },
  branchInactive: {
    message: 'Your branch is currently inactive. Please contact the super admin.',
    severity: 'error',
  },
};
