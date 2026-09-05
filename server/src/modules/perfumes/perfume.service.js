import Perfume from '../../models/Perfume.js';
import Settings from '../../models/Settings.js';
import { escapeRegex } from '../../utils/query.js';

/** How many digits the running number is padded to — AP-001, not AP-1. */
const SKU_PAD = 3;
const FALLBACK_PREFIX = 'AP';

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
