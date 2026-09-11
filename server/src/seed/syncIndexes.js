// Builds every index declared on the models against the connected database.
import mongoose from 'mongoose';
import connectDB, { disconnectDB } from '../config/db.js';
import logger from '../config/logger.js';

import User from '../models/User.js';
import Branch from '../models/Branch.js';
import Perfume from '../models/Perfume.js';
import Bill from '../models/Bill.js';
import Customer from '../models/Customer.js';
import Counter from '../models/Counter.js';
import Settings from '../models/Settings.js';

const MODELS = [User, Branch, Perfume, Bill, Customer, Counter, Settings];

const syncAllIndexes = async () => {
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
