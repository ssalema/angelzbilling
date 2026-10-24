// Turns an uploaded stock sheet into reviewable rows.

export const COLUMN_NAME = 'Perfume Name';
// Unit in the header so people don't type "1.5 kg".
export const COLUMN_STOCK = 'Stock (GM)';

const STOCK_ALIASES = [COLUMN_STOCK, 'Stock', 'Stock GM', 'Stock in GM', 'Stock (gm)'];

export const SHEET_RULES = [
  `The first row must be a header with exactly two columns named "${COLUMN_NAME}" and "${COLUMN_STOCK}".`,
  'Perfume names must match the catalogue exactly — anything unrecognised is flagged, not guessed at.',
  'Stock is the weight arriving, written in grams (gm) as a plain number: 1500, not "1.5 kg".',
  'Values must be numeric and above zero. Blank, negative and non-numeric rows are flagged and skipped.',
  'List each perfume once. A name that repeats is flagged, and only its first row is used.',
];

// Ignores case and spacing only.
const headerKey = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

// Returns the sheet's own header for each column, or null if missing.
export const findColumns = (headers = []) => {
  const match = (...wanted) =>
    headers.find((header) => wanted.some((name) => headerKey(header) === headerKey(name))) ?? null;
  return { name: match(COLUMN_NAME), stock: match(...STOCK_ALIASES) };
};

export const parseGrams = (raw) => {
  const text = String(raw ?? '').trim().replace(/,/g, '').replace(/\s*(gm|gms|g|grams?)$/i, '');
  if (!text) return NaN;
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
};

export const parseTypedGrams = (raw) => {
  if (raw === '' || raw === null || raw === undefined) return NaN;
  const value = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(value) ? value : NaN;
};

const normaliseName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export const buildSheetRows = (records, columns) => {
  const seen = new Set();

  return records.map((record, index) => {
    // +2: line 1 is the header.
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

// Merges catalogue matches into the sheet rows (matches are in order of valid rows).
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
      // Use the catalogue's spelling, not the sheet's.
      perfumeName: match.name,
      sku: match.sku,
      available: match.stock,
      isLowStock: match.isLowStock,
      isOutOfStock: match.isOutOfStock,
      // Editable; the sheet value is only the starting point.
      newStock: String(row.grams),
    };
  });
};
