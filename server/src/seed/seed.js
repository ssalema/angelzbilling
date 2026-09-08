/**
 * Creates the one account a fresh install cannot start without: the super
 * admin. Nothing else is seeded — branches, the catalogue, staff, settings and
 * bills are all created through the app.
 *
 *   npm run seed   — creates the super admin if it is missing
 */
import mongoose from 'mongoose';
import env from '../config/env.js';
import logger from '../config/logger.js';
import connectDB, { disconnectDB } from '../config/db.js';
import User from '../models/User.js';

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

  const existing = await User.findOne({ email: ADMIN.email });
  if (existing) {
    logger.info(`Super admin already present: ${existing.email}`);
  } else {
    await User.create({ ...ADMIN, branch: null });
    logger.info(`Super admin created: ${ADMIN.email}`);
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
