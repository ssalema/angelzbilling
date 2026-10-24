// Creates the first super admin. Development only; use `npm run admin:create` in production.
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import env from '../config/env.js';
import logger from '../config/logger.js';
import connectDB, { disconnectDB } from '../config/db.js';
import User from '../models/User.js';
import { passwordRule } from '../modules/auth/auth.validation.js';

if (!env.isDev) {
  console.error(
    `\n[seed] Refusing to run with NODE_ENV=${env.nodeEnv}.\n` +
      '[seed] The seed is for development databases only. To create the first\n' +
      '[seed] super admin anywhere else, run "npm run admin:create".\n'
  );
  process.exit(1);
}

// A random password is generated unless SEED_PASSWORD is set; both must pass the password rules.
const generatePassword = () => {
  let candidate;
  do candidate = crypto.randomBytes(12).toString('base64url');
  while (!passwordRule.safeParse(candidate).success);
  return candidate;
};

const seedPassword = process.env.SEED_PASSWORD
  ? passwordRule.safeParse(process.env.SEED_PASSWORD)
  : { success: true, data: generatePassword() };

if (!seedPassword.success) {
  console.error(`\n[seed] SEED_PASSWORD is too weak: ${seedPassword.error.issues[0].message}\n`);
  process.exit(1);
}

const ADMIN = {
  name: 'Super Admin',
  email: 'superadmin@angelzperfume.com',
  password: seedPassword.data,
  role: 'superadmin',
  phone: '9800000000',
};

const run = async () => {
  await connectDB();

  const existing = await User.findOne({ email: ADMIN.email });
  if (existing) {
    logger.info(`Super admin already present: ${existing.email}`);
    logger.info('Its password is unchanged. Lost it? Run "npm run admin:reset-password".');
  } else {
    await User.create({ ...ADMIN, branch: null });
    logger.info('');
    logger.info('─────────────────────────────────────────────');
    logger.info(' Seed complete. Sign in with:');
    logger.info(`   Super Admin : ${ADMIN.email}`);
    logger.info(
      process.env.SEED_PASSWORD
        ? '   Password    : the SEED_PASSWORD you set'
        : `   Password    : ${ADMIN.password}  (shown once, not stored anywhere)`
    );
    logger.info('─────────────────────────────────────────────');
  }

  await disconnectDB();
  process.exit(0);
};

run().catch(async (error) => {
  logger.error(`Seed failed: ${error.stack}`);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
