/**
 * Repacks the catalogue's running SKUs so they start at AP-001 again.
 *
 * The first import numbered on from AP-020, because a catalogue already ran to
 * AP-019 at the time. That older data has since been deleted, leaving the run
 * starting at 20 with nothing below it. This closes the gap: the perfumes are
 * ordered by the number they already carry and renumbered 1, 2, 3 … with no
 * holes, so the order of the catalogue is untouched and only the labels move.
 *
 *   npm run renumber:skus          — dry run: prints the mapping, writes nothing
 *   npm run renumber:skus -- --yes — actually renames
 *
 * Variant SKUs ride along: "AP-020-100GM" becomes "AP-001-100GM". A variant
 * whose SKU does not start with its perfume's old SKU was named by hand and is
 * left alone.
 *
 * Bills are NOT rewritten. A bill stores the SKU as it read on the day it was
 * raised, which is the point of a snapshot — old bills keep showing the old
 * number.
 */
import mongoose from 'mongoose';
import logger from '../config/logger.js';
import connectDB, { disconnectDB } from '../config/db.js';
import Perfume from '../models/Perfume.js';
import { getSkuPrefix } from '../modules/perfumes/perfume.service.js';

const CONFIRMED = process.argv.includes('--yes');

/** Matches the padding the catalogue is numbered with — AP-001, not AP-1. */
const SKU_PAD = 3;

const run = async () => {
  await connectDB();

  const prefix = await getSkuPrefix();
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);

  const rows = await Perfume.find({ sku: pattern })
    .select('sku name variants.sku')
    .sort({ createdAt: 1 })
    .lean();

  if (!rows.length) {
    logger.warn(`No perfumes carry a ${prefix}-### SKU — nothing to renumber`);
    await disconnectDB();
    return;
  }

  // Ordered by the number already in use, so the catalogue keeps its sequence
  // and every perfume simply slides down by the size of the hole.
  rows.sort((a, b) => Number(pattern.exec(a.sku)[1]) - Number(pattern.exec(b.sku)[1]));

  const moves = rows
    .map((row, index) => ({
      _id: row._id,
      name: row.name,
      from: row.sku,
      to: `${prefix}-${String(index + 1).padStart(SKU_PAD, '0')}`,
      variants: row.variants || [],
    }))
    .filter((move) => move.from !== move.to);

  logger.info(`${rows.length} perfumes numbered ${rows[0].sku} → ${rows.at(-1).sku}`);
  logger.info(`${moves.length} need renaming`);

  if (!moves.length) {
    await disconnectDB();
    return;
  }

  for (const move of moves.slice(0, 3).concat(moves.slice(-3))) {
    logger.info(`  ${move.from} → ${move.to}  ${move.name}`);
  }

  if (!CONFIRMED) {
    logger.info('');
    logger.info('Dry run — nothing written. Re-run with --yes to apply.');
    await disconnectDB();
    return;
  }

  /** A variant's SKU is its perfume's plus a suffix, so the prefix swaps too. */
  const renameVariants = (variants, from, to) =>
    variants.map((v) => (v.sku?.startsWith(from) ? `${to}${v.sku.slice(from.length)}` : v.sku));

  /**
   * `sku` is unique, so the order the renames land in matters. Packing down
   * from 1 in ascending order is safe on its own: a row's new number is never
   * higher than its old one, and every row still waiting its turn is numbered
   * above it — so nothing is ever renamed onto a SKU that is still in use.
   * That also makes a half-finished run harmless: re-running repacks whatever
   * is left, since the mapping only ever depends on the catalogue's order.
   */
  const writes = moves.map((move) => {
    const skus = renameVariants(move.variants, move.from, move.to);
    const update = { $set: { sku: move.to } };
    skus.forEach((sku, index) => {
      update.$set[`variants.${index}.sku`] = sku;
    });
    return { updateOne: { filter: { _id: move._id }, update } };
  });
  // Ordered: the safety above rests on the renames landing lowest-first.
  await Perfume.bulkWrite(writes, { ordered: true });

  logger.info('');
  logger.info('─────────────────────────────────────────────');
  logger.info(`Renumbered ${moves.length} perfumes — the catalogue now starts at ${prefix}-001.`);
  logger.info('Existing bills keep the SKU they were raised with.');

  await disconnectDB();
};

run().catch(async (error) => {
  logger.error(`renumber:skus failed: ${error.message}`);
  logger.error('A part-finished run is safe to repeat: re-run with --yes.');
  if (mongoose.connection.readyState) await disconnectDB();
  process.exit(1);
});
