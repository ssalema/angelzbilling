/**
 * Reads an .xlsx (or .csv) file in the browser, and nowhere else.
 *
 * The bulk stock screen must never hand a spreadsheet to the server: the file
 * is opened here, the cells are pulled out, and the `File` is dropped the
 * moment this returns. Nothing is uploaded, nothing is written to disk, and no
 * copy of the sheet outlives the dialog — only the rows the admin reviews.
 *
 * That rules out sending it to an API, and it also rules out shipping a
 * megabyte of parser to do it. An .xlsx is a ZIP of XML, both of which the
 * browser can already read: `DecompressionStream` inflates the entries and
 * `DOMParser` reads the sheet. So this file is the whole reader, with no
 * third-party dependency to keep patched.
 */

/** Anything larger is not a stock sheet — it is the wrong file. */
export const MAX_SHEET_BYTES = 5 * 1024 * 1024;

/** What the file picker offers, and what `readSheet` will actually open. */
export const SHEET_TYPES =
  '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,text/csv';

/** Raised for anything the admin can fix by picking a different file. */
export class SheetError extends Error {}

/* ────────────────────────────── ZIP ────────────────────────────── */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

/**
 * The archive's entries, as `{ name -> Uint8Array }`.
 *
 * Read from the central directory at the end of the file rather than by
 * walking local headers front to back: the local header's sizes are allowed to
 * be zero when a data descriptor follows, and streamed-out workbooks do exactly
 * that. The central directory always carries the real ones.
 */
const readZip = async (buffer) => {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // The end record is last, followed only by an optional comment (max 64KB).
  let eocd = -1;
  const floor = Math.max(0, bytes.length - 66_000);
  for (let i = bytes.length - 22; i >= floor; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new SheetError('That file is not a readable Excel workbook.');

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  if (offset === 0xffffffff) {
    throw new SheetError('That workbook uses the ZIP64 format. Re-save it as a standard .xlsx and try again.');
  }

  const decoder = new TextDecoder();
  const entries = new Map();

  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) break;

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);

    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    // Only the three parts a workbook's values live in — a sheet full of
    // charts and images should not be inflated to read two columns.
    if (/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/)/.test(name)) {
      // The local header repeats the name and carries its own extra field,
      // which is usually a different length from the central one.
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const raw = bytes.subarray(start, start + compressedSize);

      entries.set(name, method === 0 ? raw : await inflateRaw(raw));
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
};

const inflateRaw = async (bytes) => {
  if (typeof DecompressionStream === 'undefined') {
    throw new SheetError('This browser cannot open .xlsx files. Save the sheet as .csv, or use a current browser.');
  }
  // `bytes` is a view into the whole file, so it is copied — a stream must own
  // its buffer, and a subarray hands over the entire workbook behind it.
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/* ────────────────────────────── XML ────────────────────────────── */

const parseXml = (bytes) => {
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new SheetError('That workbook could not be read. Try re-saving it from Excel as .xlsx.');
  }
  return doc;
};

/**
 * Descendant elements with this local name.
 *
 * Walked by hand rather than through `getElementsByTagName`, because that
 * matches on the qualified name and a workbook may or may not prefix its
 * elements. Comparing `localName` sidesteps the namespace entirely, and the
 * documents here are five levels deep, so a walk costs nothing.
 */
const tags = (node, name) => {
  const found = [];
  const walk = (parent) => {
    for (let child = parent.firstElementChild; child; child = child.nextElementSibling) {
      if (child.localName === name) found.push(child);
      walk(child);
    }
  };
  walk(node);
  return found;
};

/** True when `node` sits anywhere inside an element with this local name. */
const isInside = (node, name) => {
  for (let parent = node.parentNode; parent; parent = parent.parentNode) {
    if (parent.localName === name) return true;
  }
  return false;
};

/**
 * The shared string table. Every repeated piece of text in a workbook — which
 * is every perfume name — is stored once here and referenced by index.
 *
 * A string split across runs (`<r>`) is joined back up; the phonetic guides
 * Excel adds for East Asian text are dropped, or "ZUMAR" would read "ZUMARズマー".
 */
const readSharedStrings = (bytes) => {
  if (!bytes) return [];
  return tags(parseXml(bytes), 'si').map((si) =>
    tags(si, 't')
      .filter((t) => !isInside(t, 'rPh'))
      .map((t) => t.textContent)
      .join('')
  );
};

/** "B12" -> 1. Column letters are base-26 with no zero. */
const columnIndex = (reference) => {
  const letters = /^[A-Z]+/.exec(reference || '')?.[0];
  if (!letters) return -1;
  return [...letters].reduce((total, letter) => total * 26 + (letter.charCodeAt(0) - 64), 0) - 1;
};

const cellValue = (cell, shared) => {
  const type = cell.getAttribute('t');
  if (type === 'inlineStr') return tags(cell, 't').map((t) => t.textContent).join('');
  if (type === 'e') return '';

  const value = tags(cell, 'v')[0]?.textContent ?? '';
  if (type === 's') return shared[Number(value)] ?? '';
  if (type === 'b') return value === '1' ? 'TRUE' : 'FALSE';
  return value;
};

/** The workbook's first sheet, resolved through its relationship id. */
const firstSheetPath = (entries) => {
  const workbook = entries.get('xl/workbook.xml');
  const rels = entries.get('xl/_rels/workbook.xml.rels');

  if (workbook && rels) {
    const id = tags(parseXml(workbook), 'sheet')[0]?.getAttribute('r:id');
    const target = tags(parseXml(rels), 'Relationship')
      .find((rel) => rel.getAttribute('Id') === id)
      ?.getAttribute('Target');

    if (target) {
      const path = target.replace(/^\//, '').replace(/^xl\//, '');
      if (entries.has(`xl/${path}`)) return `xl/${path}`;
    }
  }

  // A workbook with an unusual rels layout still has its sheets in one place.
  return [...entries.keys()].find((name) => name.startsWith('xl/worksheets/') && name.endsWith('.xml'));
};

const readXlsx = async (buffer) => {
  const entries = await readZip(buffer);

  const sheetPath = firstSheetPath(entries);
  if (!sheetPath) throw new SheetError('That workbook has no sheets in it.');

  const shared = readSharedStrings(entries.get('xl/sharedStrings.xml'));

  // Empty cells are simply absent from the XML, so each row is laid out by the
  // cell's own reference — otherwise a blank Stock cell would shift the columns.
  return tags(parseXml(entries.get(sheetPath)), 'row').map((row) => {
    const cells = [];
    tags(row, 'c').forEach((cell) => {
      const index = columnIndex(cell.getAttribute('r'));
      if (index >= 0) cells[index] = cellValue(cell, shared);
    });
    return [...cells].map((value) => value ?? '');
  });
};

/* ────────────────────────────── CSV ────────────────────────────── */

/** RFC 4180: quoted fields may hold commas, newlines and doubled quotes. */
const readCsv = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  const body = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];

    if (quoted) {
      if (char !== '"') field += char;
      else if (body[i + 1] === '"') {
        field += '"';
        i += 1;
      } else quoted = false;
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') endField();
    else if (char === '\n') endRow();
    else field += char;
  }

  if (field || row.length) endRow();
  return rows;
};

/* ────────────────────────────── Public ────────────────────────────── */

/**
 * Opens a spreadsheet and returns `{ headers, rows }`, where each row is an
 * object keyed by the sheet's own header text.
 *
 * `onProgress` is called with 0–100 so the caller can draw the same upload
 * frame the media panels use. Reading a local file is near-instant, so the
 * figure marks the three real stages — read, unzip, lay out the cells — rather
 * than pretending to be a network transfer.
 */
export const readSheet = async (file, onProgress) => {
  if (!file) throw new SheetError('No file was chosen.');
  if (file.size > MAX_SHEET_BYTES) {
    throw new SheetError('That file is larger than 5MB. A stock sheet should be a fraction of that.');
  }

  const name = file.name.toLowerCase();
  const isCsv = name.endsWith('.csv');
  if (!isCsv && !name.endsWith('.xlsx')) {
    throw new SheetError('Only .xlsx and .csv files can be read. Save your sheet in one of those formats.');
  }

  onProgress?.(10);
  const buffer = await file.arrayBuffer();

  onProgress?.(45);
  const grid = isCsv ? readCsv(new TextDecoder().decode(buffer)) : await readXlsx(buffer);

  onProgress?.(80);

  // The header is the first row that actually has text in it — an exported
  // sheet often opens with a blank line or two.
  const headerIndex = grid.findIndex((row) => row.some((cell) => String(cell).trim()));
  if (headerIndex < 0) throw new SheetError('That sheet is empty.');

  const headers = grid[headerIndex].map((cell) => String(cell ?? '').trim());

  const rows = grid
    .slice(headerIndex + 1)
    .map((cells) => {
      const record = {};
      headers.forEach((header, index) => {
        if (header) record[header] = String(cells[index] ?? '').trim();
      });
      return record;
    })
    // A trailing run of empty rows is normal in a hand-edited sheet.
    .filter((record) => Object.values(record).some((value) => value !== ''));

  onProgress?.(100);
  return { headers, rows };
};
