import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { verifyAccessToken, isAccessTokenRevoked } from '../utils/tokens.js';
import { getCachedUser, setCachedUser } from '../utils/userCache.js';

/** The branch fields the sidebar and the printed bill header both read. */
const BRANCH_FIELDS = 'name code address phone phoneCountryCode gstin isActive hasOwnLogo logo favicon';

// Verifies the Bearer access token and resolves the account behind it.
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) throw ApiError.unauthorized('You are not signed in. Please sign in to continue.');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    if (error.name === 'TokenExpiredError') throw ApiError.unauthorized('Your session has expired');
    throw ApiError.unauthorized('Invalid authentication token');
  }

  if (payload.tokenType !== 'access') throw ApiError.unauthorized('Invalid authentication token');

  if (isAccessTokenRevoked(payload.jti)) {
    throw ApiError.unauthorized('You have been signed out. Please sign in again.');
  }

  req.tokenId = payload.jti;

  let user = getCachedUser(payload.sub);

  if (!user) {
    user = await User
      .findById(payload.sub)
      // The sidebar prints under a branch's own logo when it has one, so /auth/me
      // has to carry the same branch fields login and refresh do.
      .populate('branch', BRANCH_FIELDS)
      .lean();
    // Only a usable account is worth caching.
    if (user?.isActive) setCachedUser(payload.sub, user);
  }

  if (!user) throw ApiError.unauthorized('This account no longer exists');
  if (!user.isActive) throw ApiError.forbidden('Your account has been deactivated. Contact the super admin.');

  // A password change invalidates tokens issued before it.
  if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime()) {
    throw ApiError.unauthorized('Your password was changed. Please sign in again.');
  }

  req.user = user;
  next();
});

export default authenticate;
