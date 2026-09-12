/** Formatting helpers shared by every screen — one place to change the locale. */

const CURRENCY_LOCALES = { INR: 'en-IN' };
const DEFAULT_LOCALE = 'en-IN';
const FOREIGN_LOCALE = 'en-US';
const DEFAULT_SYMBOL = '₹';

const localeFor = (currency) => {
  const code = String(currency || '').toUpperCase();
  if (!code) return DEFAULT_LOCALE;
  return CURRENCY_LOCALES[code] || FOREIGN_LOCALE;
};

let symbol = DEFAULT_SYMBOL;
let locale = DEFAULT_LOCALE;
let whole;
let precise2;
let plain;

const buildFormatters = () => {
  whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  precise2 = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  plain = new Intl.NumberFormat(locale);
};
buildFormatters();

/** Applied once at boot, and again whenever Settings > Billing is saved. */
export const configureCurrency = ({ currency, currencySymbol: nextSymbolRaw } = {}) => {
  const nextSymbol = nextSymbolRaw || DEFAULT_SYMBOL;
  const nextLocale = localeFor(currency);
  if (nextSymbol === symbol && nextLocale === locale) return;
  symbol = nextSymbol;
  locale = nextLocale;
  buildFormatters();
};

export const currencySymbol = () => symbol;

/**
 * Three ways to show money, one per job:
 *
 * `precise` keeps both paise always — bill lines and totals, where a column of
 * figures has to line up and add up.
 * `trim` keeps paise only when they carry something: ₹50, but ₹50.50. This is
 * formatPrice below, for what one product costs.
 * Neither rounds to whole rupees — revenue, spend and chart axes, where paise
 * are noise and would crowd a tick label.
 *
 * Paise are all-or-nothing, never the ₹50.5 that a plain 0-to-2 digit range
 * would give: half a rupee is written ₹50.50 everywhere money is read.
 */
export const formatCurrency = (value, { precise = false, trim = false } = {}) => {
  const number = Number(value || 0);
  if (trim) return `${symbol}${(Number.isInteger(number) ? whole : precise2).format(number)}`;
  return `${symbol}${(precise ? precise2 : whole).format(number)}`;
};

/**
 * A single product's price — an MRP, a selling price, one end of a range.
 * Exact to the paise when there are any, and no trailing .00 when there are not.
 */
export const formatPrice = (value) => formatCurrency(value, { trim: true });

/** A grouped amount with no symbol, for a layout whose heading already carries one. */
export const formatAmount = (value) => precise2.format(Number(value || 0));

/** Compact axis labels: 8293 -> ₹8.3K. Lakh and crore only where they are read. */
export const formatCompactCurrency = (value) => {
  const n = Number(value || 0);
  const size = Math.abs(n);
  if (locale === 'en-IN') {
    if (size >= 10000000) return `${symbol}${(n / 10000000).toFixed(1)}Cr`;
    if (size >= 100000) return `${symbol}${(n / 100000).toFixed(1)}L`;
  } else {
    if (size >= 1000000000) return `${symbol}${(n / 1000000000).toFixed(1)}B`;
    if (size >= 1000000) return `${symbol}${(n / 1000000).toFixed(1)}M`;
  }
  if (size >= 1000) return `${symbol}${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return `${symbol}${Math.round(n)}`;
};

export const formatNumber = (value) => plain.format(Number(value || 0));


// Perfume stock is held as bulk weight, so every stock figure on screen is grams.
export const formatGrams = (value) => {
  const grams = Math.max(0, Number(value || 0));
  const rounded = Math.round((grams + Number.EPSILON) * 1000) / 1000;
  if (rounded >= 1000) return `${formatNumber(Math.round((rounded / 1000) * 100) / 100)} kg`;
  return `${formatNumber(rounded)} gm`;
};

/** Whole bottles sellable out of `grams` at a given fill size. */
export const unitsFromGrams = (grams, sizeGrams) => {
  const per = Number(sizeGrams) > 0 ? Number(sizeGrams) : 1;
  return Math.floor(Math.max(0, Number(grams) || 0) / per);
};

export const formatDate = (value, style = 'medium') => {
  if (!value) return 'NA';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'NA';

  const options = {
    short: { day: '2-digit', month: 'short' },
    medium: { day: '2-digit', month: 'short', year: 'numeric' },
    long: { day: '2-digit', month: 'long', year: 'numeric' },
    time: { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
    clock: { hour: '2-digit', minute: '2-digit' },
  }[style];

  return new Intl.DateTimeFormat('en-IN', options).format(date);
};

export const formatRelative = (value) => {
  if (!value) return 'Never';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  return formatDate(value);
};

/** "AARAV SHARMA" -> "AS" for avatars. */
export const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';

export const truncate = (text = '', max = 40) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** Chart axis tick for the day/month/year buckets the API returns. */
export const formatChartKey = (key, granularity) => {
  if (!key) return '';
  if (granularity === 'year') return key;
  if (granularity === 'month') {
    const [year, month] = key.split('-');
    return `${new Date(year, Number(month) - 1).toLocaleString('en-IN', { month: 'short' })} ${year.slice(-2)}`;
  }
  const [, month, day] = key.split('-');
  return `${day} ${new Date(2000, Number(month) - 1).toLocaleString('en-IN', { month: 'short' })}`;
};

// The one place stock level becomes a status.
export const stockStatus = (perfume = {}) => {
  if (perfume.isOutOfStock) return 'out_of_stock';
  if (perfume.isLowStock) return 'low_stock';
  return 'in_stock';
};

export const STOCK_LABELS = {
  in_stock: 'In stock',
  low_stock: 'Low stock',
  out_of_stock: 'Out of stock',
};
