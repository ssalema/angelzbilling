/**
 * Turning an uploaded stock sheet into reviewable rows.
 *
 * Kept apart from the dialog so the rules an admin is shown before uploading —
 * the two column names, grams, numeric, no duplicates — are the same rules the
 * file is actually judged by, written once.
 */

/** The two columns the sheet must carry, spelled exactly like this. */
export const COLUMN_NAME = 'Perfume Name';
export const COLUMN_STOCK = 'Stock';

/** The rules shown above the dropzone, in the order they are checked. */
export const SHEET_RULES = [
  `The first row must be a header with exactly two columns named "${COLUMN_NAME}" and "${COLUMN_STOCK}".`,
  'Perfume names must match the catalogue exactly — anything unrecognised is flagged, not guessed at.',
  'Stock is the weight arriving, written in grams (gm) as a plain number: 1500, not "1.5 kg".',
  'Values must be numeric and above zero. Blank, negative and non-numeric rows are flagged and skipped.',
  'List each perfume once. A name that repeats is flagged, and only its first row is used.',
];

/** Header matching is forgiving about case and spacing, and nothing else. */
const headerKey = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** The sheet's own spelling of each required column, or null if it is missing. */
export const findColumns = (headers = []) => {
  const match = (wanted) => headers.find((header) => headerKey(header) === headerKey(wanted)) ?? null;
  return { name: match(COLUMN_NAME), stock: match(COLUMN_STOCK) };
};

/**
 * Grams out of a cell. Thousands separators and a trailing "gm" are the two
 * things a real sheet carries that a plain `Number()` would choke on; a unit we
 * do not understand is rejected rather than assumed, because reading "1.5 kg"
 * as 1.5 grams is the one mistake this screen must never make.
 */
export const parseGrams = (raw) => {
  const text = String(raw ?? '').trim().replace(/,/g, '').replace(/\s*(gm|gms|g|grams?)$/i, '');
  if (!text) return NaN;
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
};

/** Grams the admin typed into the New stock box — same rules, live. */
export const parseTypedGrams = (raw) => {
  if (raw === '' || raw === null || raw === undefined) return NaN;
  const value = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(value) ? value : NaN;
};

const normaliseName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The sheet's rows, checked against everything that can be judged without the
 * catalogue: the name is present, the stock is a positive number, and the
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
    const raw = String(record[columns.stock] ?? '').trim();
    const grams = parseGrams(raw);

    const row = { key: `row-${index}`, line, name, raw, grams };

    if (!name) return { ...row, issue: 'The Perfume Name cell is empty' };

    const key = normaliseName(name);
    if (seen.has(key)) return { ...row, issue: 'Listed more than once — only the first row was used' };
    seen.add(key);

    if (!raw) return { ...row, issue: 'The Stock cell is empty' };
    if (Number.isNaN(grams)) return { ...row, issue: `"${raw}" is not a number of grams` };
    if (grams <= 0) return { ...row, issue: 'Stock must be more than zero grams' };

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
      available: match.stock,
      isLowStock: match.isLowStock,
      isOutOfStock: match.isOutOfStock,
      // Editable from here on; the sheet's figure is only the starting point.
      newStock: String(row.grams),
    };
  });
};
