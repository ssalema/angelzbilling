/**
 * Removes the demo rows the seed script wrote, and nothing else.
 *
 * Two generations of seed data exist in this database: an older run on the
 * @angelperfume.com domain and the current @angelzperfume.com one. Both are
 * matched here. Real records — the imported catalogue (AP-001 and up), bills
 * written by real accounts, and any branch a real bill was raised against —
 * are left exactly as they are.
 *
 * Counters are deliberately not touched: real bills share the same monthly
 * sequences, so resetting them would hand out numbers that are already taken.
 *
 *   npm run purge:seed          — dry run: prints what would be deleted
 *   npm run purge:seed -- --yes — actually deletes
 */
import mongoose from 'mongoose';
import env from '../config/env.js';
import logger from '../config/logger.js';
import connectDB, { disconnectDB } from '../config/db.js';
import User from '../models/User.js';
import Branch from '../models/Branch.js';
import Perfume from '../models/Perfume.js';
import Bill from '../models/Bill.js';

const CONFIRMED = process.argv.includes('--yes');

if (env.isProd) {
  console.error('\n[purge:seed] Refusing to run with NODE_ENV=production.\n');
  process.exit(1);
}

/** The one account that survives no matter what. */
const KEEP_EMAIL = 'superadmin@angelzperfume.com';

/** Staff the seed script invented, across both domain spellings. */
const SEED_STAFF = ['delhi.admin', 'mumbai.admin', 'hyderabad.admin', 'delhi.billing', 'mumbai.billing'].flatMap(
  (local) => [`${local}@angelperfume.com`, `${local}@angelzperfume.com`]
);

/** Plus the superadmin from the older, misspelt-domain seed run. */
const SEED_USER_EMAILS = [...SEED_STAFF, 'superadmin@angelperfume.com'].filter((e) => e !== KEEP_EMAIL);

/** The 8-item demo catalogue. The real import starts at AP-020. */
const SEED_SKUS = Array.from({ length: 8 }, (_, i) => `AP-${String(i + 1).padStart(3, '0')}`);

const SEED_BRANCH_CODES = ['HQ', 'MUM', 'HYD'];

const run = async () => {
  await connectDB();
  const { host, name } = mongoose.connection;
  logger.info(`Target database: ${name} @ ${host}`);

  const billFilter = { 'billedBy.email': { $in: SEED_STAFF } };
  const userFilter = { email: { $in: SEED_USER_EMAILS } };
  const perfumeFilter = { sku: { $in: SEED_SKUS } };

  // A seed branch that a real bill was raised against is in live use — dropping
  // it would orphan that bill's branch reference, so it stays.
  const seedBranches = await Branch.find({ code: { $in: SEED_BRANCH_CODES } }, 'code name').lean();
  const inUse = new Set(
    (
      await Bill.distinct('branch.id', { 'billedBy.email': { $nin: SEED_STAFF } })
    ).map(String)
  );
  const removableBranches = seedBranches.filter((b) => !inUse.has(String(b._id)));
  const keptBranches = seedBranches.filter((b) => inUse.has(String(b._id)));

  logger.info('To be deleted:');
  logger.info(`   bills     ${await Bill.countDocuments(billFilter)}`);
  logger.info(`   perfumes  ${await Perfume.countDocuments(perfumeFilter)}`);
  logger.info(`   users     ${await User.countDocuments(userFilter)}`);
  logger.info(`   branches  ${removableBranches.length} (${removableBranches.map((b) => b.code).join(', ') || 'none'})`);
  for (const b of keptBranches) logger.info(`   kept branch ${b.code} — a real bill references it`);

  if (!CONFIRMED) {
    logger.warn('Dry run — nothing deleted. Re-run with --yes to apply.');
    await disconnectDB();
    process.exit(0);
  }

  const [bills, perfumes, users, branches] = await Promise.all([
    Bill.deleteMany(billFilter),
    Perfume.deleteMany(perfumeFilter),
    User.deleteMany(userFilter),
    Branch.deleteMany({ _id: { $in: removableBranches.map((b) => b._id) } }),
  ]);

  logger.info(
    `Deleted — bills: ${bills.deletedCount}, perfumes: ${perfumes.deletedCount}, ` +
      `users: ${users.deletedCount}, branches: ${branches.deletedCount}`
  );
  logger.info(`Kept: ${KEEP_EMAIL}, the imported catalogue, and every real bill and account.`);

  await disconnectDB();
  process.exit(0);
};

run().catch(async (error) => {
  logger.error(`Purge failed: ${error.stack}`);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
