/**
 * Super admin CLI. The password is typed at a hidden prompt; only its hash is stored.
 *   npm run admin:create                        first super admin (refuses if one exists)
 *   npm run admin:reset-password [-- <email>]   new password, signs out all sessions, clears lockout
 * Non-interactive: set ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE (optional), ADMIN_PASSWORD for that
 * one command only.
 */
import readline from 'node:readline';
import mongoose from 'mongoose';
import { z } from 'zod';
import connectDB, { disconnectDB } from '../config/db.js';
import User from '../models/User.js';
import { loginSchema, passwordRule } from '../modules/auth/auth.validation.js';
import { DEFAULT_DIAL_CODE, addContactNumberIssue } from '../utils/countries.js';

const [command, emailArg] = process.argv.slice(2);

const emailRule = loginSchema.shape.email;
const nameRule = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(80, 'Name cannot exceed 80 characters');
// Same check as the profile form: optional, digits only, length for the default dial code.
const phoneRule = z
  .string()
  .trim()
  .superRefine((number, ctx) =>
    addContactNumberIssue(ctx, { dial: DEFAULT_DIAL_CODE, number, path: [], required: false })
  );

class CliError extends Error {}

const ask = (question, { hidden = false } = {}) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
    // Hide typed keystrokes after the prompt is shown.
    if (hidden) rl._writeToOutput = () => {};
  });

const check = (rule, value) => {
  const result = rule.safeParse(value);
  if (!result.success) throw new CliError(result.error.issues[0].message);
  return result.data;
};

const readPassword = async () => {
  if (process.env.ADMIN_PASSWORD) {
    console.warn('⚠️  Using ADMIN_PASSWORD from the environment. Remove it once this command is done.');
    return check(passwordRule, process.env.ADMIN_PASSWORD);
  }
  if (!process.stdin.isTTY) {
    throw new CliError(
      'No interactive terminal to type the password in. Run this in PowerShell, cmd or a normal terminal, ' +
        'or set ADMIN_PASSWORD for this one command.'
    );
  }
  const password = check(passwordRule, await ask('New password (hidden): ', { hidden: true }));
  const again = await ask('Repeat password: ', { hidden: true });
  if (again !== password) throw new CliError('Passwords do not match');
  return password;
};

// Use the argument or env value if given; otherwise prompt with the fallback as default.
const readField = async (label, rule, given, fallback = '', { optional = false } = {}) => {
  if (given) return check(rule, given);
  if (!process.stdin.isTTY) {
    if (fallback || optional) return check(rule, fallback);
    throw new CliError(`${label} is required. Set it in the environment for this one command.`);
  }
  const answer = await ask(fallback ? `${label} [${fallback}]: ` : `${label}: `);
  return check(rule, answer.trim() || fallback);
};

const createAdmin = async () => {
  const existing = await User.findOne({ role: 'superadmin' }).select('email').lean();
  if (existing) {
    throw new CliError(
      `A super admin already exists (${existing.email}). Use "npm run admin:reset-password" to set a new password.`
    );
  }

  const name = await readField('Name', nameRule, process.env.ADMIN_NAME, 'Super Admin');
  const email = await readField('Email', emailRule, emailArg ?? process.env.ADMIN_EMAIL);
  if (await User.exists({ email })) throw new CliError(`An account with ${email} already exists`);
  const phone = await readField(`Phone (${DEFAULT_DIAL_CODE}, optional)`, phoneRule, process.env.ADMIN_PHONE, '', {
    optional: true,
  });
  const password = await readPassword();

  await User.create({
    name,
    email,
    phone,
    phoneCountryCode: DEFAULT_DIAL_CODE,
    password,
    role: 'superadmin',
    branch: null,
  });
  console.log(`✅ Super admin ${email} created. Sign in to the admin panel with it.`);
};

const resetPassword = async () => {
  const admins = await User.find({ role: 'superadmin' }).select('email').lean();
  if (!admins.length) throw new CliError('No super admin exists yet. Run "npm run admin:create" first.');

  const given = emailArg ?? process.env.ADMIN_EMAIL;
  // Shell access is trusted, so any account can be reset. A sole super admin is the default.
  const email =
    admins.length === 1 && !given
      ? admins[0].email
      : await readField('Email', emailRule, given, admins.length === 1 ? admins[0].email : '');
  const user = await User.findOne({ email }).select('+password +refreshTokens');
  if (!user) throw new CliError(`No account with ${email}`);

  console.log(`Resetting the password for ${email} (${user.roleLabel}).`);
  const password = await readPassword();
  if (await user.comparePassword(password)) throw new CliError('New password must be different from the current one');

  const sessions = user.refreshTokens.length;
  // Saving sets passwordChangedAt, which invalidates older access tokens.
  user.password = password;
  user.refreshTokens = [];
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  await user.save();

  console.log(`✅ Password updated. ${sessions} session(s) signed out; any login lockout on the account is lifted.`);
  if (!user.isActive) console.warn('⚠️  This account is deactivated, so it still cannot sign in.');
};

const COMMANDS = { create: createAdmin, 'reset-password': resetPassword };

const main = async () => {
  const run = COMMANDS[command];
  if (!run) throw new CliError('Usage: node src/seed/admin.js <create | reset-password [email]>');
  await connectDB();
  try {
    await run();
  } finally {
    await disconnectDB();
  }
};

main().catch(async (error) => {
  console.error(error instanceof CliError ? `❌ ${error.message}` : error);
  await mongoose.connection.close().catch(() => {});
  process.exitCode = 1;
});
