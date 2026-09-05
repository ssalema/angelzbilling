/** Formatting helpers shared by every screen — one place to change the locale. */

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrPrecise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatCurrency = (value, { precise = false } = {}) => {
  const number = Number(value || 0);
  return precise ? inrPrecise.format(number) : inr.format(number);
};

/** Compact axis labels: 8293 -> ₹8.3K */
export const formatCompactCurrency = (value) => {
  const n = Number(value || 0);
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return `₹${Math.round(n)}`;
};

export const formatNumber = (value) => new Intl.NumberFormat('en-IN').format(Number(value || 0));


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
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

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
