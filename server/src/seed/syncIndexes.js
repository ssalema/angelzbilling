/**
 * Builds every index declared on the models against the connected database.
 *
 *   npm run migrate:indexes
 *
 * This is the "use a migration in prod" half of `autoIndex: !env.isProd` in
 * config/db.js, and without it that setting means production simply has no
 * indexes: Mongo answers every bill list, every dashboard aggregation and every
 * login lookup with a full collection scan. It is fast enough to hide at a few
 * hundred documents and falls over completely at a few hundred thousand.
 *
 * Run it as part of the deploy, after the code that declares the indexes is
 * live and before traffic reaches it.
 *
 * `syncIndexes` is deliberate rather than `createIndexes`: it also DROPS
 * indexes that the models no longer declare, so a renamed or reworked index
 * does not leave its predecessor behind consuming writes and RAM forever. The
 * only indexes it will not touch are the ones Mongo owns itself (`_id`).
 *
 * Safe to run repeatedly — an index that already matches is left alone, so the
 * common case is a no-op that costs one round trip per collection.
 */
import mongoose from 'mongoose';
import connectDB, { disconnectDB } from '../config/db.js';
import logger from '../config/logger.js';

import User from '../models/User.js';
import Branch from '../models/Branch.js';
import Perfume from '../models/Perfume.js';
import Bill from '../models/Bill.js';
import Counter from '../models/Counter.js';
import Settings from '../models/Settings.js';

const MODELS = [User, Branch, Perfume, Bill, Counter, Settings];

/**
 * Building an index locks nothing in a modern replica set, but on a large
 * collection it is still minutes of background work. Models are done one at a
 * time so a deploy cannot start six builds at once on the same cluster.
 */
export const syncAllIndexes = async () => {
  const report = [];

  for (const Model of MODELS) {
    const startedAt = Date.now();
    try {
      // Resolves to the list of index names that were dropped, if any.
      const dropped = await Model.syncIndexes();
      const indexes = await Model.collection.indexes();

      report.push({
        model: Model.modelName,
        collection: Model.collection.name,
        indexes: indexes.length,
        dropped: dropped || [],
        ms: Date.now() - startedAt,
      });
    } catch (error) {
      // One model failing must not hide the rest — collect and carry on, then
      // exit non-zero at the end so a deploy pipeline actually notices.
      report.push({
        model: Model.modelName,
        collection: Model.collection.name,
        error: error.message,
        ms: Date.now() - startedAt,
      });
    }
  }

  return report;
};

const run = async () => {
  await connectDB();

  console.log(`\n[indexes] Syncing against ${mongoose.connection.name}\n`);

  const report = await syncAllIndexes();

  report.forEach((row) => {
    if (row.error) {
      console.error(`  ✖ ${row.model.padEnd(10)} ${row.collection.padEnd(12)} ${row.error}`);
      return;
    }
    const dropped = row.dropped.length ? `  (dropped ${row.dropped.join(', ')})` : '';
    console.log(
      `  ✔ ${row.model.padEnd(10)} ${row.collection.padEnd(12)} ${String(row.indexes).padStart(2)} indexes  ${String(row.ms).padStart(5)}ms${dropped}`
    );
  });

  const failed = report.filter((r) => r.error);
  console.log(
    failed.length
      ? `\n[indexes] ${failed.length} of ${report.length} models failed.\n`
      : `\n[indexes] All ${report.length} models synced.\n`
  );

  await disconnectDB();
  process.exit(failed.length ? 1 : 0);
};

// Only self-execute when invoked directly, so the export stays importable
// from a test or a combined migration runner.
const invokedDirectly = process.argv[1] && process.argv[1].endsWith('syncIndexes.js');
if (invokedDirectly) {
  run().catch((error) => {
    logger.error(`Index sync failed: ${error.stack}`);
    process.exit(1);
  });
}

export default syncAllIndexes;
