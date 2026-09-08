/**
 * Seeds the minimum a fresh install needs: one super admin account and the
 * store settings singleton. No demo branches, perfumes, staff or bills — the
 * catalogue and everything downstream of it is created through the app.
 *
 *   npm run seed              — creates the super admin if it is missing
 *   npm run seed -- --fresh   — wipes users, branches, perfumes, bills,
 *                               counters and settings first, then reseeds
 */
import mongoose from 'mongoose';
import env from '../config/env.js';
import logger from '../config/logger.js';
import connectDB, { disconnectDB } from '../config/db.js';
import User from '../models/User.js';
import Branch from '../models/Branch.js';
import Perfume from '../models/Perfume.js';
import Bill from '../models/Bill.js';
import Counter from '../models/Counter.js';
import Settings from '../models/Settings.js';

const FRESH = process.argv.includes('--fresh');

/**
 * This script writes an account that can sign in, so it must never run against
 * a production database — a well-known password there is a free super admin for
 * anyone who has read this repository.
 */
if (env.isProd) {
  console.error(
    '\n[seed] Refusing to run with NODE_ENV=production.\n' +
      '[seed] This creates an account with a default password. Seed a dev database instead.\n'
  );
  process.exit(1);
}

/**
 * The password comes from SEED_PASSWORD when set, so a shared or public
 * environment can be seeded without a password that is in the source.
 */
const SEED_PASSWORD = process.env.SEED_PASSWORD || 'Admin@1234';

const ADMIN = {
  name: 'Super Admin',
  email: 'superadmin@angelzperfume.com',
  password: SEED_PASSWORD,
  role: 'superadmin',
  phone: '9800000000',
};

const run = async () => {
  await connectDB();

  if (FRESH) {
    logger.warn('--fresh flag detected: clearing users, branches, perfumes, bills, counters and settings');
    await Promise.all([
      User.deleteMany({}),
      Branch.deleteMany({}),
      Perfume.deleteMany({}),
      Bill.deleteMany({}),
      Counter.deleteMany({}),
      Settings.deleteMany({}),
    ]);
  }

  // ── Super admin ──
  let superAdmin = await User.findOne({ email: ADMIN.email });
  if (superAdmin) {
    logger.info(`Super admin already present: ${superAdmin.email}`);
  } else {
    superAdmin = await User.create({ ...ADMIN, branch: null });
    logger.info(`Super admin created: ${superAdmin.email}`);
  }

  // ── Settings ──
  const settings = await Settings.getSingleton();
  if (!settings.contactEmail) {
    settings.set({
      siteName: 'Angelz Perfume',
      contactEmail: 'care@angelzperfume.com',
      billing: { billPrefix: 'AP', currencySymbol: '₹', defaultTaxPercent: 0 },
    });
    await settings.save();
    logger.info('Store settings seeded');
  }

  logger.info('');
  logger.info('─────────────────────────────────────────────');
  logger.info(' Seed complete. Sign in with:');
  logger.info(`   Super Admin : ${ADMIN.email}`);
  logger.info(
    process.env.SEED_PASSWORD
      ? '   Password    : the SEED_PASSWORD you set'
      : `   Password    : ${SEED_PASSWORD}  (dev default — set SEED_PASSWORD to change it)`
  );
  logger.info('   Change this before the database is reachable by anyone else.');
  logger.info('─────────────────────────────────────────────');

  await disconnectDB();
  process.exit(0);
};

run().catch(async (error) => {
  logger.error(`Seed failed: ${error.stack}`);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
