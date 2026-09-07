/**
 * Mirrors the server's `utils/priceLadder.js`, so the preview an admin approves
 * is the arithmetic the API then performs. That file carries the derivation and
 * the reasoning; this copy exists only so the review table can be drawn without
 * a round trip per keystroke.
 *
 * The server still recomputes every figure from the base price it is sent — a
 * price this file works out is shown, never saved. Same split as
 * `perfumeSchema.js`: that copy is UX, the server's is truth.
 */

import { sizeGramsFor } from '../perfumeSchema.js';

/** The fills the ladder knows, smallest first, in grams. */
export const LADDER_GRAMS = [25, 50, 100, 250, 500, 1000];

/** The fill the admin actually types a price for. */
export const BASE_GRAMS = 1000;
export const BASE_LABEL = '1000gm';

export const MIN_BASE_PRICE = 1;
export const MAX_BASE_PRICE = 10_000_000;

/** MRP for each ladder fill, keyed by grams. See the server file for the rules. */
export const priceLadderFrom = (basePrice) => {
  const base = Number(basePrice);
  if (!Number.isFinite(base) || base <= 0) return null;

  const small = Math.ceil((base + 300) / 200) * 5;

  return {
    25: small,
    50: small * 2,
    100: small * 4,
    250: Math.floor(base / 4) + 50,
    500: Math.round(base / 2),
    1000: Math.round(base),
  };
};

/**
 * The ladder laid over a perfume's real variants — one row per size it sells,
 * smallest fill first, each carrying what it costs now and what it would cost.
 *
 * A fill the ladder has no rule for (a 200gm, say) keeps its price and is
 * marked `priced: false`, so the preview can show it greyed rather than
 * pretending a figure was generated for it.
 */
export const repriceVariants = (perfume, basePrice) => {
  const ladder = priceLadderFrom(basePrice);

  return (perfume?.variants || [])
    .map((variant) => {
      const grams = sizeGramsFor(variant);
      const next = ladder?.[grams];
      const currentMrp = Number(variant.mrp) || 0;

      return {
        sku: variant.sku,
        label: variant.label || `${grams}gm`,
        sizeGrams: grams,
        isActive: variant.isActive !== false,
        discountPercent: Number(variant.discountPercent) || 0,
        currentMrp,
        newMrp: ladder ? (next ?? currentMrp) : null,
        priced: next !== undefined,
      };
    })
    .sort((a, b) => a.sizeGrams - b.sizeGrams);
};

/**
 * A base price typed into a box, or read out of a spreadsheet cell.
 * Thousands separators and a leading ₹ are the two things a real sheet carries
 * that `Number()` alone would choke on.
 */
export const parseBasePrice = (raw) => {
  if (raw === '' || raw === null || raw === undefined) return NaN;
  const text = String(raw).trim().replace(/[₹,\s]/g, '').replace(/\/-$/, '');
  if (!text) return NaN;
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
};

/** Why this base price cannot be used, or '' when it can. */
export const basePriceIssue = (value) => {
  if (Number.isNaN(value)) return 'Enter the price as a number';
  if (value <= 0) return 'Price must be more than zero';
  if (value < MIN_BASE_PRICE) return `Price must be at least ₹${MIN_BASE_PRICE}`;
  if (value > MAX_BASE_PRICE) return 'That price is far higher than any perfume in the catalogue';
  return '';
};
