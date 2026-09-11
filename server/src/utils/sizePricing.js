// Per-size pricing.

// `[{ sizeGrams, mrp }]` as a `Map` keyed by grams.
export const pricesBySize = (prices = []) => {
  const map = new Map();
  prices.forEach(({ sizeGrams, mrp }) => map.set(Number(sizeGrams), Number(mrp)));
  return map;
};
