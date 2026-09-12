/** Shared option lists. Keeping them here stops labels drifting between screens. */

/**
 * How much of a bill staff may discount without a Branch Admin, when the store's
 * own figure is not to hand. It mirrors DEFAULT_MAX_DISCOUNT_PERCENT on the
 * server, which is the side that actually enforces it — the two have to agree or
 * the billing form would promise a ceiling the server does not keep.
 */
export const DEFAULT_MAX_DISCOUNT_PERCENT = 20;

// The store's locations are the Head Office plus every branch.
export const HEAD_OFFICE = { id: 'head-office', name: 'Head Office', code: 'HO', isHeadOffice: true };

/** The location a record belongs to, with the Head Office standing in for null. */
export const locationOf = (branch) => (branch?.id ? branch : HEAD_OFFICE);

/** How a location is labelled in a table cell or chip. */
export const locationLabel = (branch) => locationOf(branch).name;

/**
 * The fuller label a picker or a summary line uses — "Testing (TB)". The server
 * words location changes the same way, so the notice someone reads on the
 * sign-in page names the location exactly as the picker that moved them did.
 */
export const locationFullLabel = (branch) => {
  const location = locationOf(branch);
  return location.code ? `${location.name} (${location.code})` : location.name;
};

/** Head Office first, then the branches — the order every picker uses. */
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

// How much of a bill the customer settles at the counter.
export const PAYMENT_TERMS = [
  { value: 'full', label: 'Full Paid', description: 'The customer settles the whole bill now' },
  { value: 'partial', label: 'Partial Paid', description: 'Part now, the balance collected later' },
];

export const PERFUME_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

/** Standard perfume fill sizes, offered as one-click presets in the wizard. */
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

// What every uploader accepts.
export const IMAGE_TYPES = 'image/jpeg,image/jpg,image/pjpeg,.jfif,image/png,image/gif,image/webp';

/** Cloudinary and the server both cap a single upload here. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'jpe', 'jfif', 'png', 'gif', 'webp'];

// Windows often hands the browser a blank type for .jfif and other less common
// extensions, so the name is the fallback. The server reads the actual bytes.
const looksLikeImage = (file) => {
  if (file?.type?.startsWith('image/')) return true;
  const name = file?.name || '';
  return IMAGE_EXTENSIONS.includes(name.split('.').pop()?.toLowerCase());
};

// Why an image was turned away, or null if it is fine.
export const rejectImageReason = (file) => {
  if (!looksLikeImage(file)) return 'That is not an image — pick a JPEG, PNG, WEBP or GIF.';
  if (file.size > MAX_UPLOAD_BYTES) return 'That image is over 5MB. Save a smaller copy and try again.';
  return null;
};

// The password rule, worded once.
export const PASSWORD_HINT =
  'At least 8 characters with an uppercase letter, a lowercase letter and a number';

/**
 * Why a session ended, as the sign-in page states it. One family of wording, so
 * a session that ends on its own always explains itself the same way: what
 * happened, then what to do next. Severity follows what the person can do about
 * it: `info` when signing back in fixes it, `warning` when the session lapsed on
 * its own, and `error` for the two that will refuse a fresh sign-in as well — so
 * being shut out mid-session looks exactly like being shut out at the sign-in
 * form, which is the same red banner the login attempt itself would raise.
 */
export const SESSION_NOTICE = {
  expired: { message: 'Your session expired. Please sign in again.', severity: 'warning' },
  ended: { message: 'Your session has ended. Please sign in again.', severity: 'info' },
  passwordChanged: {
    message: 'Your password was changed. Please sign in with your new password.',
    severity: 'info',
  },
  // Both ends of the same sentence the server sends when an account or the
  // location behind it is switched off mid-session.
  deactivated: {
    message: 'Your account has been deactivated. Please contact the super admin.',
    severity: 'error',
  },
  branchInactive: {
    message: 'Your branch is currently inactive. Please contact the super admin.',
    severity: 'error',
  },
};
