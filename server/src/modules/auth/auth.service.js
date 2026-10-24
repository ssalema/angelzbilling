import User from '../../models/User.js';
import ApiError from '../../utils/ApiError.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  refreshCookieMaxAge,
} from '../../utils/tokens.js';
import { isBranchInactive, BRANCH_INACTIVE_MESSAGE } from '../../utils/branchAccess.js';

const MAX_SESSIONS = 5; // max signed-in devices per account

// Issues a token pair and stores the hashed refresh token on the user.
const issueTokens = async (user, userAgent = '') => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  // Pull expired tokens by condition (not from a snapshot) so live sessions are never lost.
  await User.updateOne(
    { _id: user._id },
    { $pull: { refreshTokens: { expiresAt: { $lte: new Date() } } } }
  );

  await User.updateOne(
    { _id: user._id },
    {
      $push: {
        refreshTokens: {
          $each: [
            {
              tokenHash: hashToken(refreshToken),
              expiresAt: new Date(Date.now() + refreshCookieMaxAge()),
              userAgent: String(userAgent).slice(0, 200),
              createdAt: new Date(),
            },
          ],
          $slice: -MAX_SESSIONS,
        },
      },
    }
  );

  return { accessToken, refreshToken };
};

const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

export const login = async ({ email, password, userAgent }) => {
  const user = await User.findOne({ email })
    .select('+password +refreshTokens +failedLoginAttempts +lockedUntil')
    .populate('branch', 'name code address phone phoneCountryCode gstin isActive hasOwnLogo logo favicon');

  // Check the lockout before the password so a locked account cannot be probed.
  // The lockout is per account, not per IP.
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    throw ApiError.forbidden(
      `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
    );
  }

  // Same message for unknown user and wrong password, so emails cannot be probed.
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

  if (isBranchInactive(user)) throw ApiError.forbidden(BRANCH_INACTIVE_MESSAGE);

  const tokens = await issueTokens(user, userAgent);
  // A successful login clears the lockout.
  await User.updateOne(
    { _id: user._id },
    { $set: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null } }
  );

  user.lastLoginAt = new Date();
  return { user, ...tokens };
};

/** Rotates the refresh token; the used one is retired. */
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
    .populate('branch', 'name code address phone phoneCountryCode gstin isActive hasOwnLogo logo favicon');

  if (!user) throw ApiError.unauthorized('This account no longer exists');
  if (!user.isActive)
    throw ApiError.sessionEnded('Your account has been deactivated. Please contact the super admin.');
  // Block refresh for inactive branches, or an open tab would keep renewing its session.
  if (isBranchInactive(user)) throw ApiError.sessionEnded(BRANCH_INACTIVE_MESSAGE);

  // A single atomic claim guarantees the token is used only once.
  const presented = hashToken(token);
  const claim = await User.updateOne(
    {
      _id: user._id,
      refreshTokens: { $elemMatch: { tokenHash: presented, expiresAt: { $gt: new Date() } } },
    },
    { $pull: { refreshTokens: { tokenHash: presented } } }
  );

  if (!claim.modifiedCount) {
    throw ApiError.unauthorized('Your session is no longer valid. Please sign in again.');
  }

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
