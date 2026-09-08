/**
 * Per-size pricing.
 *
 * Every fill a perfume sells carries its own price, set on its own. Nothing is
 * derived from anything else: changing the 1000gm price leaves the 25gm exactly
 * where it was, and a size nobody typed a price for keeps the price it has.
 *
 * This replaced a "ladder" that generated all six prices from the kilo rate.
 * The catalogue turned out not to obey one rule — a few dozen perfumes are
 * priced by hand and sat several rupees off any formula — so deriving prices
 * quietly rewrote figures the shop had chosen deliberately. Sizes are now
 * independent, and a blank means "leave it alone" rather than "recalculate".
 *
 * Mirrored for the browser in `admin/src/features/perfumes/pricing/sizePricing.js`.
 * That copy draws the preview; this one is what actually gets written.
 */

/** The fills the catalogue sells, smallest first, in grams. */
export const SIZE_GRAMS = [25, 50, 100, 250, 500, 1000];

/** A price outside this is a typo, not a repricing. */
export const MIN_PRICE = 1;
export const MAX_PRICE = 10_000_000;

/** Most variants a single perfume can be repriced in one go. */
export const MAX_SIZES_PER_PERFUME = 40;

/**
 * `[{ sizeGrams, mrp }]` as a `Map` keyed by grams.
 *
 * Later entries win, so a payload that names the same fill twice settles on one
 * price rather than depending on which variant the write happens to reach first.
 */
export const pricesBySize = (prices = []) => {
  const map = new Map();
  prices.forEach(({ sizeGrams, mrp }) => map.set(Number(sizeGrams), Number(mrp)));
  return map;
};
