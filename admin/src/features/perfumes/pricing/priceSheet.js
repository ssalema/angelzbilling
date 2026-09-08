/**
 * Turning an uploaded price sheet into reviewable rows.
 *
 * Kept apart from the dialog so the rules an admin is shown before uploading —
 * the column names, exact name matching, blank means unchanged — are the same
 * rules the file is actually judged by, written once.
 *
 * The sheet carries one column per fill size. Every size is independent: a
 * blank cell leaves that size at the price it already has, and nothing is
 * derived from anything else.
 */

import { SIZE_GRAMS, parsePrice, priceIssue } from './sizePricing.js';

/** The one column the sheet must always carry, spelled exactly like this. */
export const COLUMN_NAME = 'Perfume Name';

/** "100gm Price" — the heading for a fill of that many grams. */
export const priceColumnFor = (grams) => `${grams}gm Price`;

/** The size columns a sheet is expected to carry, in catalogue order. */
export const PRICE_COLUMNS = SIZE_GRAMS.map(priceColumnFor);

/** The rules shown above the dropzone, in the order they are checked. */
export const SHEET_RULES = [
  `The first row must be a header. It needs a "${COLUMN_NAME}" column, plus a price column for each size you are changing — ${PRICE_COLUMNS.join(', ')}.`,
  'Include only the price columns you need. A sheet that changes just the 500gm price needs two columns.',
  'Perfume names must match the catalogue exactly — anything unrecognised is flagged, not guessed at.',
  'Leave a cell blank to keep that price exactly as it is. Blank never means "recalculate" — no price is ever worked out from another price.',
  'Prices must be a number above zero. Negative and non-numeric cells are flagged and skipped.',
  'List each perfume once. A name that repeats is flagged, and only its first row is used.',
  'List only the perfumes whose price is changing — anything left out of the sheet is left alone.',
];

/** Header matching is forgiving about case and spacing, and nothing else. */
const headerKey = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Reads the header row into the columns this screen understands.
 *
 * Size columns are matched by pattern rather than against a fixed list, so a
 * perfume sold in an unusual fill — a 200gm, say — can be repriced by adding a
 * "200gm Price" column, with no change here.
 */
export const findColumns = (headers = []) => {
  const name = headers.find((header) => headerKey(header) === headerKey(COLUMN_NAME)) ?? null;

  const sizes = [];
  headers.forEach((header) => {
    const match = /^(\d+(?:\.\d+)?)\s*(?:gm|g|gms|gram|grams)\s*price$/i.exec(headerKey(header));
    if (match) {
      const grams = Number(match[1]);
      // A sheet that repeats a size column would otherwise apply both silently.
      if (grams > 0 && !sizes.some((size) => size.grams === grams)) sizes.push({ grams, header });
    }
  });

  sizes.sort((a, b) => a.grams - b.grams);
  return { name, sizes };
};

const normaliseName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The sheet's rows, checked against everything that can be judged without the
 * catalogue: the name is present, at least one price was given, every price
 * given is a positive number, and the perfume has not already been listed.
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

    /** Only the sizes this row actually fills in. Blank cells never appear. */
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

/**
 * Merges the catalogue's answer into the sheet's rows.
 *
 * `matches` comes back from the server in the same order it was asked, one
 * entry per name that got as far as being worth looking up.
 *
 * A price for a size the perfume does not sell is dropped and reported rather
 * than written — "500gm Price" against a perfume with no 500gm bottle is a
 * mistake in the sheet, not an instruction to create one.
 */
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
      // The catalogue's spelling, so the review table reads the way the rest of
      // the panel does even when the sheet used a different case.
      perfumeName: match.name,
      sku: match.sku,
      image: match.image || '',
      variants: match.variants || [],
      prices: usable,
      // Shown as a warning on the row rather than silently dropped.
      skippedSizes: unknown.map((price) => `${price.sizeGrams}gm`),
    };
  });
};

/**
 * A matched row's sizes as the review table wants them — the same shape
 * `sizeRows` produces for the single tab, so both flows share one table.
 */
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
