/**
 * Turning an uploaded price sheet into reviewable rows.
 *
 * Kept apart from the dialog so the rules an admin is shown before uploading —
 * the two column names, exact name matching, one positive kilo price — are the
 * same rules the file is actually judged by, written once.
 *
 * Deliberately the same shape as `stock/stockSheet.js`: an admin who has
 * uploaded a stock sheet already knows how this one behaves.
 */

import { BASE_LABEL, basePriceIssue, parseBasePrice } from './priceLadder.js';

/** The two columns the sheet must carry, spelled exactly like this. */
export const COLUMN_NAME = 'Perfume Name';
export const COLUMN_PRICE = `${BASE_LABEL} Price`;

/** The rules shown above the dropzone, in the order they are checked. */
export const SHEET_RULES = [
  `The first row must be a header with exactly two columns named "${COLUMN_NAME}" and "${COLUMN_PRICE}".`,
  'Perfume names must match the catalogue exactly — anything unrecognised is flagged, not guessed at.',
  `Give only the ${BASE_LABEL} price. Every other size — 25gm, 50gm, 100gm, 250gm and 500gm — is worked out from it for you.`,
  'Prices must be a number above zero. Blank, negative and non-numeric rows are flagged and skipped.',
  'List each perfume once. A name that repeats is flagged, and only its first row is used.',
  'List only the perfumes whose price is changing — anything left out of the sheet is left alone.',
];

/** Header matching is forgiving about case and spacing, and nothing else. */
const headerKey = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** The sheet's own spelling of each required column, or null if it is missing. */
export const findColumns = (headers = []) => {
  const match = (wanted) => headers.find((header) => headerKey(header) === headerKey(wanted)) ?? null;
  return { name: match(COLUMN_NAME), price: match(COLUMN_PRICE) };
};

const normaliseName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The sheet's rows, checked against everything that can be judged without the
 * catalogue: the name is present, the price is a positive number, and the
 * perfume has not already been listed.
 *
 * Rows keep their original sheet line number so a flagged row can be found and
 * fixed in the file the admin still has open.
 */
export const buildSheetRows = (records, columns) => {
  const seen = new Set();

  return records.map((record, index) => {
    // +2: the header is line 1, and the first record is the line after it.
    const line = index + 2;
    const name = String(record[columns.name] ?? '').trim();
    const raw = String(record[columns.price] ?? '').trim();
    const basePrice = parseBasePrice(raw);

    const row = { key: `row-${index}`, line, name, raw, basePrice };

    if (!name) return { ...row, issue: 'The Perfume Name cell is empty' };

    const key = normaliseName(name);
    if (seen.has(key)) return { ...row, issue: 'Listed more than once — only the first row was used' };
    seen.add(key);

    if (!raw) return { ...row, issue: `The ${COLUMN_PRICE} cell is empty` };

    const issue = basePriceIssue(basePrice);
    if (issue) return { ...row, issue: Number.isNaN(basePrice) ? `"${raw}" is not a price` : issue };

    return { ...row, issue: '' };
  });
};

/**
 * Merges the catalogue's answer into the sheet's rows.
 *
 * `matches` comes back from the server in the same order it was asked, one
 * entry per name that got as far as being worth looking up.
 */
export const applyMatches = (rows, matches) => {
  const queue = [...matches];

  return rows.map((row) => {
    if (row.issue) return { ...row, matched: false };

    const match = queue.shift();
    if (!match?.matched) {
      return { ...row, matched: false, issue: match?.reason || 'No perfume in the catalogue has this name' };
    }

    return {
      ...row,
      matched: true,
      id: match.id,
      // The catalogue's spelling, so the review table reads the way the rest of
      // the panel does even when the sheet used a different case.
      perfumeName: match.name,
      sku: match.sku,
      // The review table draws the same name-and-thumbnail cell the single tab
      // does, so the catalogue's picture travels with the row.
      image: match.image || '',
      variants: match.variants || [],
      currentBase: match.basePrice,
    };
  });
};
