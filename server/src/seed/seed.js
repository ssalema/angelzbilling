// Creates the one account a fresh install cannot start without: the super admin.
import mongoose from 'mongoose';
import env from '../config/env.js';
import logger from '../config/logger.js';
import connectDB, { disconnectDB } from '../config/db.js';
import User from '../models/User.js';

// Allowed only where NODE_ENV explicitly says 'development'.
if (!env.isDev) {
  console.error(
    `\n[seed] Refusing to run with NODE_ENV=${env.nodeEnv}.\n` +
      '[seed] This creates an account with a known password, so it runs only when\n' +
      '[seed] NODE_ENV is explicitly "development". Seed a development database instead.\n'
  );
  process.exit(1);
}

if (!process.env.SEED_PASSWORD) {
  console.warn(
    '\n[seed] SEED_PASSWORD is not set, so a well-known default password will be used.\n' +
      '[seed] Change it immediately, or set SEED_PASSWORD before seeding.\n'
  );
}

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
