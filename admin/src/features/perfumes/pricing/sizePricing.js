import { currencySymbol, formatPrice } from '../../../utils/format.js';
import { sizeGramsFor } from '../perfumeSchema.js';

/** Sizes the catalogue sells, in grams, smallest first. */
export const SIZE_GRAMS = [25, 50, 100, 250, 500, 1000];

const MIN_PRICE = 1;
const MAX_PRICE = 10_000_000;

/** Escapes text for a regex character class (the currency symbol can be anything). */
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

// Parses a typed or spreadsheet price, ignoring the currency symbol, commas and a trailing "/-".
export const parsePrice = (raw) => {
  if (raw === '' || raw === null || raw === undefined) return NaN;
  const strip = new RegExp(`[${escapeRe(currencySymbol())},\\s]`, 'g');
  const text = String(raw).trim().replace(strip, '').replace(/\/-$/, '');
  if (!text) return NaN;
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
};

/** Error message for an invalid price, or '' when valid. */
export const priceIssue = (value) => {
  if (Number.isNaN(value)) return 'Enter the price as a number';
  if (value <= 0) return 'Price must be more than zero';
  if (value < MIN_PRICE) return `Price must be at least ${formatPrice(MIN_PRICE)}`;
  if (value > MAX_PRICE) return 'That price is far higher than any perfume in the catalogue';
  return '';
};

// One row per size, smallest first, with the current and new price.
export const sizeRows = (perfume, edits = {}) =>
  (perfume?.variants || [])
    .map((variant) => {
      const sizeGrams = sizeGramsFor(variant);
      const currentMrp = Number(variant.mrp) || 0;

      const input = edits[sizeGrams] ?? '';
      const blank = String(input).trim() === '';
      const parsed = blank ? NaN : parsePrice(input);
      const issue = blank ? '' : priceIssue(parsed);
      const valid = !blank && !issue;

      return {
        sizeGrams,
        label: variant.label || `${sizeGrams}gm`,
        sku: variant.sku,
        isActive: variant.isActive !== false,
        discountPercent: Number(variant.discountPercent) || 0,
        currentMrp,
        input,
        issue,
        newMrp: valid ? parsed : currentMrp,
        changed: valid && parsed !== currentMrp,
      };
    })
    .sort((a, b) => a.sizeGrams - b.sizeGrams);

/** Min and max price, ignoring unpriced sizes. */
const rangeOf = (values = []) => {
  const priced = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  if (!priced.length) return null;
  return { min: Math.min(...priced), max: Math.max(...priced) };
};

/** "185 – 7,000", or a single price when min equals max. */
export const formatRange = (range) => {
  if (!range) return 'NA';
  if (range.min === range.max) return formatPrice(range.min);
  return `${formatPrice(range.min)} – ${formatPrice(range.max)}`;
};

export const currentRange = (rows) => rangeOf(rows.map((row) => row.currentMrp));

export const newRange = (rows) => rangeOf(rows.map((row) => row.newMrp));

/** Only changed sizes are sent to the server. */
export const changedPrices = (rows) =>
  rows.filter((row) => row.changed).map((row) => ({ sizeGrams: row.sizeGrams, mrp: row.newMrp }));
