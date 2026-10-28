import Perfume from '../../models/Perfume.js';
import Settings from '../../models/Settings.js';
import { escapeRegex } from '../../utils/query.js';

/** How many digits the running number is padded to — AP-001, not AP-1. */
const SKU_PAD = 3;

/** The catalogue borrows the bill prefix, so both numbers read as one brand. */
export const getSkuPrefix = async () => {
  const settings = await Settings.findOne().select('billing.billPrefix').lean();
  return String(settings?.billing?.billPrefix || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
};

// The next free running SKU for the catalogue, e.g. AP-001, or 001 with no prefix set.
export const generateSku = async (prefix) => {
  const base = prefix || (await getSkuPrefix());
  const lead = base ? `${escapeRegex(base)}-` : '';
  const pattern = new RegExp(`^${lead}(\\d+)$`);

  const rows = await Perfume.find({ sku: pattern }).select('sku').lean();
  const highest = rows.reduce((max, row) => {
    const seq = Number(pattern.exec(row.sku)?.[1]);
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);

  return `${base ? `${base}-` : ''}${String(highest + 1).padStart(SKU_PAD, '0')}`;
};

// A run of consecutive free SKUs, e.g.
export const generateSkuBlock = async (count, prefix) => {
  const base = prefix || (await getSkuPrefix());
  const lead = base ? `${escapeRegex(base)}-` : '';
  const pattern = new RegExp(`^${lead}(\\d+)$`);

  const rows = await Perfume.find({ sku: pattern }).select('sku').lean();
  const highest = rows.reduce((max, row) => {
    const seq = Number(pattern.exec(row.sku)?.[1]);
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);

  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const seq = highest + index + 1;
    // Past the padding the number simply gets longer — AP-1000, not AP-100.
    return `${base ? `${base}-` : ''}${String(seq).padStart(SKU_PAD, '0')}`;
  });
};
