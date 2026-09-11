// Fills in the derived stores that were added after data already existed.
//
// Two figures on the dashboard are read from denormalised stores rather than
// recomputed on every request: `Perfume.stockMargin` (stock minus its low-stock
// threshold, so the restock filters are indexable) and the `customers`
// collection (one row per person ever billed). Every write path maintains both,
// but rows written *before* those stores existed carry neither — a perfume with
// no `stockMargin` cannot match `{ stockMargin: { $lte: 0 } }`, because Mongo's
// range operators never match a missing field. That is why a catalogue could
// report "2 out of stock" on the summary card and still show an empty restock
// panel, and why a shop with bills could report zero customers.
//
// Both passes below are idempotent, so running this twice changes nothing.
import mongoose from 'mongoose';
import connectDB, { disconnectDB } from '../config/db.js';
import logger from '../config/logger.js';

import Perfume from '../models/Perfume.js';
import Bill from '../models/Bill.js';
import Customer from '../models/Customer.js';

/**
 * Writes `stockMargin` onto perfumes that have none.
 *
 * `{ stockMargin: { $exists: false } }` is served by the index on that field, so
 * this costs nothing once every document has been filled.
 */
export const backfillStockMargin = async ({ all = false } = {}) => {
  const filter = all ? {} : { stockMargin: { $exists: false } };

  const result = await Perfume.updateMany(filter, [
    {
      $set: {
        stockMargin: {
          $subtract: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$lowStockThreshold', 100] }],
        },
      },
    },
  ]);

  return result.modifiedCount || 0;
};

/**
 * Rebuilds the customer roll-up from the bills that still count.
 *
 * Refunded bills are excluded for the same reason `Customer.reconcile` excludes
 * them: a person whose only bill was handed back was never a customer.
 */
export const backfillCustomers = async () => {
  const rows = await Bill.aggregate([
    { $match: { status: { $ne: 'refunded' } } },
    {
      $project: {
        createdAt: 1,
        'branch.id': 1,
        'customer.name': 1,
        'customer.mobile': 1,
        'customer.mobileCountryCode': 1,
      },
    },
    { $match: { 'customer.mobile': { $nin: [null, ''] } } },
    {
      $group: {
        // Country code + number together, exactly as `CUSTOMER_KEY` and
        // `recordBill` build it, so a rebuild lands on the same _id.
        _id: {
          key: {
            $concat: [{ $ifNull: ['$customer.mobileCountryCode', '+91'] }, '$customer.mobile'],
          },
          branch: { $ifNull: ['$branch.id', null] },
        },
        mobile: { $first: '$customer.mobile' },
        code: { $first: { $ifNull: ['$customer.mobileCountryCode', '+91'] } },
        firstSeenAt: { $min: '$createdAt' },
        lastSeenAt: { $max: '$createdAt' },
        latestName: { $last: '$customer.name' },
      },
    },
    { $sort: { lastSeenAt: 1 } },
    {
      $group: {
        _id: '$_id.key',
        mobile: { $first: '$mobile' },
        mobileCountryCode: { $first: '$code' },
        // Sorted by recency above, so the last one is the name on their most
        // recent bill — the rule `recordBill` follows.
        name: { $last: '$latestName' },
        firstSeenAt: { $min: '$firstSeenAt' },
        lastSeenAt: { $max: '$lastSeenAt' },
        branches: { $push: { branch: '$_id.branch', firstSeenAt: '$firstSeenAt' } },
      },
    },
  ]);

  if (!rows.length) return 0;

  const operations = rows.map((row) => ({
    updateOne: {
      filter: { _id: row._id },
      update: {
        $set: {
          mobile: row.mobile,
          mobileCountryCode: row.mobileCountryCode,
          name: row.name || '',
          firstSeenAt: row.firstSeenAt,
          lastSeenAt: row.lastSeenAt,
          branches: row.branches,
        },
      },
      upsert: true,
    },
  }));

  const BATCH = 500;
  let written = 0;

  for (let start = 0; start < operations.length; start += BATCH) {
    // eslint-disable-next-line no-await-in-loop
    const result = await Customer.bulkWrite(operations.slice(start, start + BATCH), { ordered: false });
    written += (result.upsertedCount || 0) + (result.modifiedCount || 0);
  }

  return written;
};

/**
 * The boot-time pass: cheap enough to run on every start, and it only touches
 * what is actually missing.
 *
 * A failure here is logged rather than thrown — an incomplete roll-up is a wrong
 * number on one card, not a reason to refuse to serve the API.
 */
export const runBackfill = async ({ force = false } = {}) => {
  const summary = { perfumes: 0, customers: 0 };

  try {
    summary.perfumes = await backfillStockMargin({ all: force });
  } catch (error) {
    logger.error(`Stock margin backfill failed: ${error.message}`);
  }

  try {
    // Rebuilding every customer on every boot would be wasteful, so the pass is
    // skipped once the roll-up is already populated.
    const needed = force || (await Customer.estimatedDocumentCount()) === 0;
    if (needed) summary.customers = await backfillCustomers();
  } catch (error) {
    logger.error(`Customer backfill failed: ${error.message}`);
  }

  if (summary.perfumes || summary.customers) {
    logger.info(
      `Backfill: ${summary.perfumes} perfume stock margins, ${summary.customers} customer records`
    );
  }

  return summary;
};

/* ─────────────────────────── Standalone runner ─────────────────────────── */

const run = async () => {
  await connectDB();

  // `--force` recomputes everything rather than only what is missing, for when a
  // write path is suspected of having drifted.
  const force = process.argv.includes('--force');

  console.log(`\n[backfill] Running against ${mongoose.connection.name}${force ? ' (forced)' : ''}\n`);

  const summary = await runBackfill({ force });

  console.log(`  ✔ perfumes   ${String(summary.perfumes).padStart(5)} stock margins written`);
  console.log(`  ✔ customers  ${String(summary.customers).padStart(5)} records written\n`);

  await disconnectDB();
  process.exit(0);
};

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('backfill.js');
if (invokedDirectly) {
  run().catch((error) => {
    logger.error(`Backfill failed: ${error.stack}`);
    process.exit(1);
  });
}

export default runBackfill;
