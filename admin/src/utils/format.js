/** Formatting helpers shared by every screen — one place to change the locale. */

/**
 * Currency is a store setting, not a constant: Settings > Billing carries the
 * symbol the store prints and the ISO code it trades in. `configureCurrency` is
 * called by the settings provider as soon as those land, so every screen that
 * already calls `formatCurrency` picks them up without knowing where they came
 * from — these helpers are plain functions used well outside React.
 *
 * The SYMBOL is authoritative, so an amount is built as "<symbol><number>"
 * rather than through `style: 'currency'` — otherwise the ISO code would
 * quietly override a symbol the admin typed by hand.
 *
 * The code only picks the grouping locale, which is the one thing it can be
 * trusted for: 12,34,567 in India, 1,234,567 nearly everywhere else.
 */
const CURRENCY_LOCALES = { INR: 'en-IN' };
const DEFAULT_LOCALE = 'en-IN';
const FOREIGN_LOCALE = 'en-US';
const DEFAULT_SYMBOL = '₹';

/**
 * Indian grouping is this app's starting point, not its assumption: an UNSET
 * code means settings have not loaded yet and the boot default stands, while a
 * code that is set and is not INR groups the way the rest of the world does.
 */
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

/**
 * The configured symbol on its own, for the places that render it apart from an
 * amount — a field adornment, a column heading.
 */
export const currencySymbol = () => symbol;

export const formatCurrency = (value, { precise = false } = {}) => {
  const number = Number(value || 0);
  return `${symbol}${(precise ? precise2 : whole).format(number)}`;
};

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


/**
 * Perfume stock is held as bulk weight, so every stock figure on screen is grams.
 * Anything at or above a kilo reads better as kg — "12.5 kg" beats "12,500 gm".
 */
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

/**
 * The one place stock level becomes a status. Perfume rows, the detail page and
 * the low-stock panel all read it from here, so a bottle that is "low" on one
 * screen is never "in stock" on the next.
 */
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
