import Perfume from '../../models/Perfume.js';
import Settings, { DEFAULT_BILL_PREFIX } from '../../models/Settings.js';
import { escapeRegex } from '../../utils/query.js';

/** How many digits the running number is padded to — AP-001, not AP-1. */
const SKU_PAD = 3;
const FALLBACK_PREFIX = DEFAULT_BILL_PREFIX;

/** The catalogue borrows the bill prefix, so both numbers read as one brand. */
export const getSkuPrefix = async () => {
  const settings = await Settings.findOne().select('billing.billPrefix').lean();
  const prefix = String(settings?.billing?.billPrefix || FALLBACK_PREFIX)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return prefix || FALLBACK_PREFIX;
};

/**
 * The next free running SKU for the catalogue, e.g. "AP-009".
 *
 * The number is read off the catalogue itself (highest in use + 1) rather than
 * from a Counter: a wizard the user abandons, or a perfume deleted before it
 * was ever billed, would otherwise burn a number and leave a hole in the run.
 * Variant SKUs (AP-008-50GM) carry a suffix, so they never match the pattern
 * and can't push the count forward.
 */
export const generateSku = async (prefix) => {
  const base = prefix || (await getSkuPrefix());
  const pattern = new RegExp(`^${escapeRegex(base)}-(\\d+)$`);

  const rows = await Perfume.find({ sku: pattern }).select('sku').lean();
  const highest = rows.reduce((max, row) => {
    const seq = Number(pattern.exec(row.sku)?.[1]);
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);

  return `${base}-${String(highest + 1).padStart(SKU_PAD, '0')}`;
};

/**
 * A run of consecutive free SKUs, e.g. ["AP-925", "AP-926", "AP-927"].
 *
 * The bulk catalogue upload needs a whole block at once, and asking
 * `generateSku` `count` times would hand back the same number every time — it
 * reads the catalogue, and nothing has been written yet.
 *
 * The highest number in use is read once and the block runs on from there, so a
 * sheet of a thousand perfumes numbers itself in a single query. Two admins
 * uploading at the same second can still be handed overlapping blocks; the
 * unique index on `sku` is what actually settles that, and the bulk create
 * re-numbers whatever it rejects.
 */
export const generateSkuBlock = async (count, prefix) => {
  const base = prefix || (await getSkuPrefix());
  const pattern = new RegExp(`^${escapeRegex(base)}-(\\d+)$`);

  const rows = await Perfume.find({ sku: pattern }).select('sku').lean();
  const highest = rows.reduce((max, row) => {
    const seq = Number(pattern.exec(row.sku)?.[1]);
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);

  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const seq = highest + index + 1;
    // Past the padding the number simply gets longer — AP-1000, not AP-100.
    return `${base}-${String(seq).padStart(SKU_PAD, '0')}`;
  });
};
