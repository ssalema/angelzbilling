// Fills `Perfume.stockMargin` and the `customers` collection for data created
// before those fields existed (Mongo range queries never match a missing field).
// Safe to run more than once.
import mongoose from 'mongoose';
import connectDB, { disconnectDB } from '../config/db.js';
import logger from '../config/logger.js';

import Perfume from '../models/Perfume.js';
import Bill from '../models/Bill.js';
import Customer from '../models/Customer.js';

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

// Rebuilds customers from bills. Refunded bills are skipped, like `Customer.reconcile`.
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
        // Same key as `CUSTOMER_KEY` / `recordBill`, so a rebuild hits the same _id.
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
        // Sorted by recency, so this is the name on the latest bill.
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

// Runs on every boot. Errors are logged, not thrown, so the API still starts.
export const runBackfill = async ({ force = false } = {}) => {
  const summary = { perfumes: 0, customers: 0 };

  try {
    summary.perfumes = await backfillStockMargin({ all: force });
  } catch (error) {
    logger.error(`Stock margin backfill failed: ${error.message}`);
  }

  try {
    // Only rebuild customers when the collection is empty (or forced).
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

const run = async () => {
  await connectDB();

  // `--force` recomputes everything, not just missing values.
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
