/**
 * One 1000gm price in, a price for every fill size out.
 *
 * Repricing a perfume is repricing six variants, and doing that by hand across
 * a 940-row catalogue is where the mistakes come from. The catalogue itself
 * already answers what the six prices should be — every row of
 * `seed/perfumes.data.js` was priced off its kilo rate by the same house rule,
 * so this file is that rule written down rather than a new one invented:
 *
 *   25gm    the kilo rate for 25 g, plus the small-fill margin, taken up to
 *           the next ₹5          →  ceil((B + 300) / 200) × 5
 *   50gm    twice the 25gm price
 *   100gm   four times the 25gm price
 *   250gm   a quarter kilo, plus a flat ₹50 handling  →  floor(B / 4) + 50
 *   500gm   half the kilo rate exactly
 *   1000gm  the price given
 *
 * Checked against all 923 priced rows in `perfumes.data.js`: 250gm, 500gm and
 * 1000gm reproduce exactly on every single row, and the 25/50/100 chain on 877
 * of them. The 46 that differ are legacy hand-priced rows — they sit ±₹5 off on
 * the small fills only (a handful predate the ₹5 rounding entirely, e.g. a
 * 25gm at ₹43). Repricing one of those through this ladder moves its small
 * fills onto the house rule, which is the point of the screen; the preview
 * shows the admin every figure before anything is written.
 *
 * Mirrored for the browser in `admin/src/features/perfumes/pricing/priceLadder.js`
 * so the preview an admin approves is the arithmetic the server then performs.
 * That copy is UX; this one is truth — the API always recomputes from the base
 * price rather than trusting the figures a client sends back.
 */

import { resolveSizeGrams } from './grams.js';

/** The fills the ladder knows, smallest first, in grams. */
export const LADDER_GRAMS = [25, 50, 100, 250, 500, 1000];

/** The fill the base price is quoted for — the only figure an admin types. */
export const BASE_GRAMS = 1000;

/** A base price outside this is a typo, not a repricing. */
export const MIN_BASE_PRICE = 1;
export const MAX_BASE_PRICE = 10_000_000;

/**
 * MRP for each ladder fill, keyed by grams.
 *
 * Money stays in whole rupees: every rule above lands on an integer for the
 * even kilo prices the catalogue uses, and `Math.round` only bites on an odd
 * base, where half a rupee is noise rather than a rounding policy.
 */
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
 * The ladder applied to a perfume's actual variants.
 *
 * Returns one row per variant so the preview can show every size the perfume
 * really sells, in the order it sells them — including any fill the ladder has
 * no rule for. Those keep their current price and say so, because guessing a
 * price for a 200gm bottle is worse than leaving it for a human.
 *
 * Inactive variants are priced too: they are switched off, not retired, and an
 * admin who turns one back on should not find it holding last year's price.
 */
export const repriceVariants = (perfume, basePrice) => {
  const ladder = priceLadderFrom(basePrice);
  if (!ladder) return null;

  return (perfume?.variants || []).map((variant) => {
    const grams = resolveSizeGrams(variant);
    const next = ladder[grams];

    const currentMrp = Number(variant.mrp) || 0;
    const discountPercent = Number(variant.discountPercent) || 0;

    return {
      sku: variant.sku,
      label: variant.label,
      sizeGrams: grams,
      isActive: variant.isActive !== false,
      discountPercent,
      currentMrp,
      // No rule for this fill — the row is shown, and left exactly as it is.
      newMrp: next === undefined ? currentMrp : next,
      priced: next !== undefined,
    };
  });
};

/** True when the perfume has at least one fill the ladder can actually price. */
export const hasPriceableFill = (perfume) =>
  (perfume?.variants || []).some((variant) => LADDER_GRAMS.includes(resolveSizeGrams(variant)));
