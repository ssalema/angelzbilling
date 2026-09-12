/** Shared option lists. Keeping them here stops labels drifting between screens. */

// The store's locations are the Head Office plus every branch.
export const HEAD_OFFICE = { id: 'head-office', name: 'Head Office', code: 'HO', isHeadOffice: true };

/** The location a record belongs to, with the Head Office standing in for null. */
export const locationOf = (branch) => (branch?.id ? branch : HEAD_OFFICE);

/** How a location is labelled in a table cell or chip. */
export const locationLabel = (branch) => locationOf(branch).name;

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
 * happened, then what to do next. `warning` is for the two the person cannot
 * simply sign back in from.
 */
export const SESSION_NOTICE = {
  expired: { message: 'Your session expired. Please sign in again.', severity: 'warning' },
  ended: { message: 'Your session has ended. Please sign in again.', severity: 'info' },
  passwordChanged: {
    message: 'Your password was changed. Please sign in with your new password.',
    severity: 'info',
  },
};
