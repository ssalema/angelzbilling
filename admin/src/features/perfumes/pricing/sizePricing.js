/**
 * Per-size pricing, browser side.
 *
 * Mirrors the server's `utils/sizePricing.js`. Every fill carries its own
 * price and nothing is derived: typing a new 1000gm price leaves the 25gm
 * exactly where it was, and a size left blank keeps the price it has.
 *
 * This file only works out what to SHOW. The prices an admin approves are sent
 * as an explicit per-size list, and the server writes those and nothing else.
 */

import { formatCurrency } from '../../../utils/format.js';
import { sizeGramsFor } from '../perfumeSchema.js';

/** The fills the catalogue sells, smallest first, in grams. */
export const SIZE_GRAMS = [25, 50, 100, 250, 500, 1000];

export const MIN_PRICE = 1;
export const MAX_PRICE = 10_000_000;

/**
 * A price typed into a box, or read out of a spreadsheet cell.
 * Thousands separators and a leading ₹ are the two things a real sheet carries
 * that `Number()` alone would choke on.
 */
export const parsePrice = (raw) => {
  if (raw === '' || raw === null || raw === undefined) return NaN;
  const text = String(raw).trim().replace(/[₹,\s]/g, '').replace(/\/-$/, '');
  if (!text) return NaN;
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
};

/** Why this price cannot be used, or '' when it can. */
export const priceIssue = (value) => {
  if (Number.isNaN(value)) return 'Enter the price as a number';
  if (value <= 0) return 'Price must be more than zero';
  if (value < MIN_PRICE) return `Price must be at least ₹${MIN_PRICE}`;
  if (value > MAX_PRICE) return 'That price is far higher than any perfume in the catalogue';
  return '';
};

/**
 * One row per size the perfume sells, smallest fill first, carrying what it
 * costs now and what it would cost.
 *
 * `edits` is keyed by grams and holds whatever is in the box right now — a raw
 * string, because it is mid-typing. A blank box is not a change: `newMrp` falls
 * back to the current price and `changed` stays false, which is the whole point
 * of the screen.
 */
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

/** Cheapest and dearest across a set of prices, ignoring unpriced sizes. */
export const rangeOf = (values = []) => {
  const priced = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  if (!priced.length) return null;
  return { min: Math.min(...priced), max: Math.max(...priced) };
};

/** "₹185 – ₹7,000", or a single figure when every size costs the same. */
export const formatRange = (range) => {
  if (!range) return 'NA';
  if (range.min === range.max) return formatCurrency(range.min);
  return `${formatCurrency(range.min)} – ${formatCurrency(range.max)}`;
};

/** The range a perfume sells at today. */
export const currentRange = (rows) => rangeOf(rows.map((row) => row.currentMrp));

/** The range it would sell at once the pending edits are applied. */
export const newRange = (rows) => rangeOf(rows.map((row) => row.newMrp));

/** Only the sizes that actually move — what gets sent to the server. */
export const changedPrices = (rows) =>
  rows.filter((row) => row.changed).map((row) => ({ sizeGrams: row.sizeGrams, mrp: row.newMrp }));
