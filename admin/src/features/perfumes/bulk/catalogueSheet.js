/**
 * Turning an uploaded catalogue sheet into reviewable new perfumes.
 *
 * Kept apart from the screen so the rules an admin is shown before uploading —
 * the column names, the gram prices, one row per perfume — are the same rules
 * the file is actually judged by, written once. The stock and price sheets are
 * built the same way; this is the third of the three, and the only one that
 * creates rather than updates.
 *
 * Three things this sheet deliberately does NOT carry:
 *
 *   SKU. The catalogue numbers its own new rows (AP-925, AP-926…), so a sheet
 *   cannot set one. The server hands the numbers out and the review screen
 *   shows what each perfume is about to be called.
 *
 *   Photographs. A spreadsheet cell cannot hold a picture the catalogue can
 *   read, and the file is never stored, so photos are added on the review
 *   screen instead — one click per perfume, from the admin's own machine. That
 *   also means a forgotten photo never costs a second trip through the sheet.
 *
 *   A derived price. A gram size with no price in the file is a size the
 *   perfume does not sell — it is never worked out from a neighbouring size.
 *   See `sizePricing.js` for why that rule exists.
 */

import { SIZE_GRAMS, parsePrice, priceIssue } from '../pricing/sizePricing.js';

/** The one column every sheet must carry, spelled exactly like this. */
export const COLUMN_NAME = 'Perfume Name';

/** The optional columns, in the order they are read. */
export const COLUMN_CATEGORY = 'Category';
/** Spelled with its unit, because a column headed "Stock" invites "1.5 kg". */
export const COLUMN_STOCK = 'Stock (GM)';

/**
 * Headings that also mean the stock column. A sheet written before the heading
 * carried its unit still reads correctly — the figure was always grams.
 */
const STOCK_ALIASES = [COLUMN_STOCK, 'Stock', 'Stock GM', 'Stock in GM', 'Stock (gm)'];

/** "100gm Price" — the heading for a fill of that many grams. */
export const priceColumnFor = (grams) => `${grams}gm Price`;

/** The size columns a catalogue sheet is expected to carry, smallest first. */
export const PRICE_COLUMNS = SIZE_GRAMS.map(priceColumnFor);

/** The rules shown above the dropzone, in the order they are checked. */
export const SHEET_RULES = [
  `The first row must be a header. It needs a "${COLUMN_NAME}" column, and may also carry "${COLUMN_CATEGORY}" and "${COLUMN_STOCK}", plus a price column for each size — ${PRICE_COLUMNS.join(', ')}.`,
  'Leave out the SKU. Every new perfume is numbered automatically, carrying on from the last one in your catalogue.',
  'Leave out the photos too. The sheet is for the figures — you add each perfume’s picture on the review screen, one click per row, before anything is saved.',
  'Give a price for at least one size. A size left blank is a size this perfume does not sell — no price is ever worked out from another price.',
  'Prices must be a number above zero. Negative and non-numeric cells are flagged and skipped.',
  'Stock is the weight you hold, written in grams (gm) as a plain number: 1500, not "1.5 kg". Leave it blank for none.',
  'A name already in your catalogue is flagged, never overwritten — this screen only ever adds new perfumes.',
  'List each perfume once. A name that repeats in the sheet is flagged, and only its first row is used.',
];

/**
 * Most perfumes one sheet can carry. Mirrors `MAX_BULK_CREATE_ROWS` on the
 * server, so a sheet too long to be accepted is turned away here — before a
 * thousand rows have been read and reviewed for nothing.
 */
export const MAX_SHEET_ROWS = 2000;

/** Header matching is forgiving about case and spacing, and nothing else. */
const headerKey = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const findHeader = (headers, wanted) =>
  headers.find((header) => headerKey(header) === headerKey(wanted)) ?? null;

/**
 * Reads the header row into the columns this screen understands.
 *
 * Size columns are matched by pattern rather than against a fixed list, so a
 * perfume sold in an unusual fill — a 200gm, say — can be created by adding a
 * "200gm Price" column, with no change here.
 */
export const findColumns = (headers = []) => {
  const sizes = [];
  headers.forEach((header) => {
    const match = /^(\d+(?:\.\d+)?)\s*(?:gm|g|gms|gram|grams)\s*price$/i.exec(headerKey(header));
    if (match) {
      const grams = Number(match[1]);
      // A sheet that repeats a size column would otherwise price it twice.
      if (grams > 0 && !sizes.some((size) => size.grams === grams)) sizes.push({ grams, header });
    }
  });

  sizes.sort((a, b) => a.grams - b.grams);

  return {
    name: findHeader(headers, COLUMN_NAME),
    category: findHeader(headers, COLUMN_CATEGORY),
    stock: STOCK_ALIASES.map((alias) => findHeader(headers, alias)).find(Boolean) ?? null,
    sizes,
  };
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

const normaliseName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** The longest name the catalogue will hold. */
const MAX_NAME = 180;

/**
 * The sheet's rows, checked against everything that can be judged without the
 * catalogue: the name is there, at least one price was given, every price and
 * the stock are sensible numbers, and the perfume has not already been listed
 * further up the file.
 *
 * `photo` starts empty on every row. It is filled in on the review screen, from
 * the admin's own machine, and never from the sheet.
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
    const category = columns.category ? String(record[columns.category] ?? '').trim() : '';
    const rawStock = columns.stock ? String(record[columns.stock] ?? '').trim() : '';

    /** Only the sizes this row actually fills in. Blank cells never appear. */
    const prices = [];
    const badCells = [];

    columns.sizes.forEach(({ grams, header }) => {
      const raw = String(record[header] ?? '').trim();
      if (!raw) return; // blank — this perfume is not sold in this size

      const value = parsePrice(raw);
      const issue = priceIssue(value);
      if (issue) badCells.push(`${grams}gm ("${raw}")`);
      else prices.push({ sizeGrams: grams, mrp: value });
    });

    const stock = rawStock ? parseGrams(rawStock) : 0;

    // `photo` and `photoPublicId` are the review screen's to fill in.
    const row = { key: `row-${index}`, line, name, category, prices, stock, photo: '', photoPublicId: '' };

    /* The order matters: the first thing wrong with a row is the thing worth
       telling the admin about, and a row with no name has nothing else to say. */
    if (!name) return { ...row, issue: 'The Perfume Name cell is empty' };
    if (name.length < 2) return { ...row, issue: 'That name is too short to be a perfume' };
    if (name.length > MAX_NAME) return { ...row, issue: `That name is longer than ${MAX_NAME} characters` };

    const key = normaliseName(name);
    if (seen.has(key)) return { ...row, issue: 'Listed more than once — only the first row was used' };
    seen.add(key);

    if (badCells.length) return { ...row, issue: `Not a valid price: ${badCells.join(', ')}` };
    if (!prices.length) {
      return {
        ...row,
        issue: columns.sizes.length
          ? 'No price was given for any size — a perfume needs at least one'
          : 'This sheet has no price columns (for example "100gm Price")',
      };
    }

    if (rawStock && Number.isNaN(stock)) return { ...row, issue: `"${rawStock}" is not a number of grams` };
    if (stock < 0) return { ...row, issue: 'Stock cannot be negative' };

    return { ...row, issue: '' };
  });
};

/**
 * Merges the catalogue's answer into the sheet's rows.
 *
 * `checks` comes back from the server in the same order it was asked, one entry
 * per name that got as far as being worth checking. A row that survives carries
 * the SKU it is about to be given — the number is the admin's main reason for
 * reading this screen, so it is shown before anything is created rather than
 * after.
 */
export const applyChecks = (rows, checks) => {
  const queue = [...checks];

  return rows.map((row) => {
    if (row.issue) return { ...row, ready: false };

    const check = queue.shift();
    if (!check?.available) {
      return { ...row, ready: false, issue: check?.reason || 'This perfume cannot be created' };
    }

    return { ...row, ready: true, sku: check.sku };
  });
};

/**
 * What a row will be created as.
 *
 * Publishing needs an image, exactly as it does in the wizard, so this follows
 * the photo: a row is a draft until one is added on the review screen, and
 * becomes published the moment it has one.
 */
export const statusFor = (row) => (row.photo ? 'published' : 'draft');

/** The rows that will actually be sent — everything the server needs, and nothing else. */
export const toPayload = (rows) =>
  rows
    .filter((row) => row.ready)
    .map((row) => ({
      name: row.name,
      category: row.category,
      stock: row.stock || 0,
      image: row.photo || '',
      // Carried so the perfume owns its upload: deleting it later takes the
      // Cloudinary asset with it, the same as an image added in the wizard.
      imagePublicId: row.photoPublicId || '',
      prices: row.prices,
    }));
