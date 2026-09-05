/**
 * Perfume is held as bulk weight, so `stock` everywhere in this codebase is a
 * number of GRAMS — not a bottle count. Selling two 100gm bottles removes 200 g.
 *
 * Every place that converts between "grams on hand" and "bottles we can sell"
 * goes through this file, so the billing screen, the validator and the stock
 * ledger can never disagree about the arithmetic.
 */

/** Fill sizes are written as "100gm" / "100 g" / "100 ml" on labels and options. */
const SIZE_PATTERN = /(\d+(?:\.\d+)?)\s*(kg|kgs|g|gm|gms|gram|grams|ml|l)\b/i;

const TO_GRAMS = { kg: 1000, kgs: 1000, l: 1000, g: 1, gm: 1, gms: 1, gram: 1, grams: 1, ml: 1 };

/** Pulls a gram figure out of free text like "100gm / Gold". Returns 0 if absent. */
const parseGrams = (text) => {
  const match = SIZE_PATTERN.exec(String(text ?? ''));
  if (!match) return 0;
  const grams = Number(match[1]) * (TO_GRAMS[match[2].toLowerCase()] ?? 1);
  return Number.isFinite(grams) && grams > 0 ? round3(grams) : 0;
};

const round3 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;

/**
 * How many grams leave stock for one unit of this variant (or of a plain perfume).
 *
 * An explicit `sizeGrams` always wins. When it is missing — every row written
 * before stock moved to grams — we fall back to the Size option and then the
 * label, which is why "100gm" catalogues keep billing correctly with no
 * migration. A row with nothing parseable falls back to 1 g per unit, which
 * degrades to the old unit-for-unit behaviour instead of dividing by zero.
 */
export const resolveSizeGrams = (target) => {
  if (!target) return 1;
  const explicit = Number(target.sizeGrams);
  if (Number.isFinite(explicit) && explicit > 0) return round3(explicit);

  const options = target.options instanceof Map ? Object.fromEntries(target.options) : target.options || {};
  const sizeOption = Object.entries(options).find(([key]) => /size|weight|fill|volume/i.test(key))?.[1];

  return parseGrams(sizeOption) || parseGrams(target.label) || parseGrams(target.name) || 1;
};

/** Whole units sellable out of `grams` on hand at this fill size. */
export const unitsFromGrams = (grams, sizeGrams) => {
  const per = Number(sizeGrams) > 0 ? Number(sizeGrams) : 1;
  return Math.floor(Math.max(0, Number(grams) || 0) / per);
};

/**
 * The smallest fill a perfume can still be poured into — the size that decides
 * whether ANY unit is sellable out of the shared weight. Falls back to the
 * perfume's own pack size when it has no variants.
 */
export const smallestFillGrams = (perfume) => {
  const active = (perfume?.variants || []).filter((v) => v?.isActive !== false);
  const sizes = (active.length ? active : perfume?.variants || []).map((v) => resolveSizeGrams(v));
  if (perfume?.hasVariants && sizes.length) return Math.min(...sizes);
  return resolveSizeGrams(perfume);
};

/** Grams consumed by selling `quantity` units of this fill size. */
export const gramsForQuantity = (quantity, sizeGrams) =>
  round3((Number(quantity) || 0) * (Number(sizeGrams) > 0 ? Number(sizeGrams) : 1));

/** "1.25 kg" for large holdings, "250 gm" otherwise — used in user-facing messages. */
export const formatGrams = (grams) => {
  const value = round3(Math.max(0, Number(grams) || 0));
  if (value >= 1000) return `${round3(value / 1000).toLocaleString('en-IN')} kg`;
  return `${value.toLocaleString('en-IN')} gm`;
};
