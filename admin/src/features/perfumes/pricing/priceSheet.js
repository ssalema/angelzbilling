// Parses an uploaded price sheet into rows for review.

import { SIZE_GRAMS, parsePrice, priceIssue } from './sizePricing.js';

/** The only required column. */
export const COLUMN_NAME = 'Perfume Name';

export const priceColumnFor = (grams) => `${grams}gm Price`;

export const PRICE_COLUMNS = SIZE_GRAMS.map(priceColumnFor);

/** Rules shown above the dropzone. */
export const SHEET_RULES = [
  `The first row must be a header. It needs a "${COLUMN_NAME}" column, plus a price column for each size you are changing — ${PRICE_COLUMNS.join(', ')}.`,
  'Include only the price columns you need. A sheet that changes just the 500gm price needs two columns.',
  'Perfume names must match the catalogue exactly — anything unrecognised is flagged, not guessed at.',
  'Leave a cell blank to keep that price exactly as it is. Blank never means "recalculate" — no price is ever worked out from another price.',
  'Prices must be a number above zero. Negative and non-numeric cells are flagged and skipped.',
  'List each perfume once. A name that repeats is flagged, and only its first row is used.',
  'List only the perfumes whose price is changing — anything left out of the sheet is left alone.',
];

/** Header matching ignores case and extra spacing only. */
const headerKey = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export const findColumns = (headers = []) => {
  const name = headers.find((header) => headerKey(header) === headerKey(COLUMN_NAME)) ?? null;

  const sizes = [];
  headers.forEach((header) => {
    const match = /^(\d+(?:\.\d+)?)\s*(?:gm|g|gms|gram|grams)\s*price$/i.exec(headerKey(header));
    if (match) {
      const grams = Number(match[1]);
      // Ignore a repeated size column.
      if (grams > 0 && !sizes.some((size) => size.grams === grams)) sizes.push({ grams, header });
    }
  });

  sizes.sort((a, b) => a.grams - b.grams);
  return { name, sizes };
};

const normaliseName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export const buildSheetRows = (records, columns) => {
  const seen = new Set();

  return records.map((record, index) => {
    // +2: the header is line 1.
    const line = index + 2;
    const name = String(record[columns.name] ?? '').trim();

    const prices = [];
    const badCells = [];

    columns.sizes.forEach(({ grams, header }) => {
      const raw = String(record[header] ?? '').trim();
      if (!raw) return; // blank — this size keeps its current price

      const value = parsePrice(raw);
      const issue = priceIssue(value);
      if (issue) badCells.push(`${grams}gm ("${raw}")`);
      else prices.push({ sizeGrams: grams, mrp: value });
    });

    const row = { key: `row-${index}`, line, name, prices };

    if (!name) return { ...row, issue: 'The Perfume Name cell is empty' };

    const key = normaliseName(name);
    if (seen.has(key)) return { ...row, issue: 'Listed more than once — only the first row was used' };
    seen.add(key);

    if (badCells.length) {
      return { ...row, issue: `Not a valid price: ${badCells.join(', ')}` };
    }
    if (!prices.length) {
      return { ...row, issue: 'No price given for any size — every size cell on this row is blank' };
    }

    return { ...row, issue: '' };
  });
};

// Merges the server's matches into the rows (in order, skipping rows with issues).
export const applyMatches = (rows, matches) => {
  const queue = [...matches];

  return rows.map((row) => {
    if (row.issue) return { ...row, matched: false };

    const match = queue.shift();
    if (!match?.matched) {
      return { ...row, matched: false, issue: match?.reason || 'No perfume in the catalogue has this name' };
    }

    const sold = new Set((match.variants || []).map((variant) => variant.sizeGrams));
    const usable = row.prices.filter((price) => sold.has(price.sizeGrams));
    const unknown = row.prices.filter((price) => !sold.has(price.sizeGrams));

    if (!usable.length) {
      return {
        ...row,
        matched: false,
        issue: `This perfume is not sold in ${row.prices.map((p) => `${p.sizeGrams}gm`).join(', ')}`,
      };
    }

    return {
      ...row,
      matched: true,
      id: match.id,
      // Use the catalogue's spelling, not the sheet's.
      perfumeName: match.name,
      sku: match.sku,
      image: match.image || '',
      variants: match.variants || [],
      prices: usable,
      // Shown as a warning instead of being silently dropped.
      skippedSizes: unknown.map((price) => `${price.sizeGrams}gm`),
    };
  });
};

export const reviewRowsFor = (row) => {
  const wanted = new Map(row.prices.map((price) => [price.sizeGrams, price.mrp]));

  return (row.variants || [])
    .map((variant) => {
      const currentMrp = Number(variant.mrp) || 0;
      const next = wanted.get(variant.sizeGrams);
      const newMrp = next === undefined ? currentMrp : next;

      return {
        sizeGrams: variant.sizeGrams,
        label: variant.label || `${variant.sizeGrams}gm`,
        sku: variant.sku,
        isActive: variant.isActive !== false,
        currentMrp,
        newMrp,
        changed: newMrp !== currentMrp,
        input: '',
        issue: '',
      };
    })
    .sort((a, b) => a.sizeGrams - b.sizeGrams);
};
