import User from '../../models/User.js';
import ApiError from '../../utils/ApiError.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  refreshCookieMaxAge,
} from '../../utils/tokens.js';

const MAX_SESSIONS = 5; // one account, at most five signed-in devices

const prune = (tokens = []) => tokens.filter((t) => t.expiresAt > new Date());

/** Issues a fresh pair and records the (hashed) refresh token on the user. */
const issueTokens = async (user, userAgent = '') => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  const kept = prune(user.refreshTokens || []).slice(-(MAX_SESSIONS - 1));
  kept.push({
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + refreshCookieMaxAge()),
    userAgent: String(userAgent).slice(0, 200),
    createdAt: new Date(),
  });

  await User.updateOne({ _id: user._id }, { $set: { refreshTokens: kept } });

  return { accessToken, refreshToken };
};

const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

export const login = async ({ email, password, userAgent }) => {
  const user = await User.findOne({ email })
    .select('+password +refreshTokens +failedLoginAttempts +lockedUntil')
    .populate('branch', 'name code address phone phoneCountryCode gstin isActive hasOwnLogo logo');

  // The account brake is checked before the password so a locked account cannot
  // be probed at all, and it follows the account rather than the caller's IP.
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    throw ApiError.forbidden(
      `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
    );
  }

  // Same message for "no such user" and "wrong password" — do not confirm which
  // emails exist to someone probing the login form.
  if (!user || !(await user.comparePassword(password))) {
    if (user) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      await User.updateOne(
        { _id: user._id },
        attempts >= MAX_FAILED_LOGINS
          ? { $set: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MS) } }
          : { $set: { failedLoginAttempts: attempts } }
      );
    }
    throw ApiError.unauthorized('Incorrect email or password');
  }

  if (!user.isActive) {
    throw ApiError.forbidden('Your account has been deactivated. Please contact the super admin.');
  }

  if (user.branch && user.branch.isActive === false) {
    throw ApiError.forbidden('Your branch is currently inactive. Please contact the super admin.');
  }

  const tokens = await issueTokens(user, userAgent);
  // A good password clears the brake.
  await User.updateOne(
    { _id: user._id },
    { $set: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null } }
  );

  user.lastLoginAt = new Date();
  return { user, ...tokens };
};

/** Rotates the refresh token: the presented one is retired as it is redeemed. */
export const refreshSession = async (token, userAgent = '') => {
  if (!token) throw ApiError.unauthorized('Your session has expired. Please sign in again.');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized('Your session has expired. Please sign in again.');
  }

  const user = await User.findById(payload.sub)
    .select('+refreshTokens')
    .populate('branch', 'name code address phone phoneCountryCode gstin isActive hasOwnLogo logo');

  if (!user) throw ApiError.unauthorized('This account no longer exists');
  if (!user.isActive) throw ApiError.forbidden('Your account has been deactivated.');

  const presented = hashToken(token);
  const match = (user.refreshTokens || []).find((t) => t.tokenHash === presented);
  if (!match || match.expiresAt < new Date()) {
    throw ApiError.unauthorized('Your session is no longer valid. Please sign in again.');
  }

  user.refreshTokens = (user.refreshTokens || []).filter((t) => t.tokenHash !== presented);
  const tokens = await issueTokens(user, userAgent);

  return { user, ...tokens };
};

export const logout = async (userId, token) => {
  if (!userId) return;
  if (token) {
    await User.updateOne({ _id: userId }, { $pull: { refreshTokens: { tokenHash: hashToken(token) } } });
  } else {
    await User.updateOne({ _id: userId }, { $set: { refreshTokens: [] } });
  }
};

export const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId).select('+password');
  if (!user) throw ApiError.notFound('Account not found');

  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest('Your current password is incorrect', [
      { field: 'currentPassword', message: 'Incorrect password' },
    ]);
  }

  user.password = newPassword;
  user.refreshTokens = []; // changing a password signs out every other device
  await user.save();
};

export default { login, refreshSession, logout, changePassword, issueTokens };
