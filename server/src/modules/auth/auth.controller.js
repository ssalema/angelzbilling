import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import { REFRESH_COOKIE, refreshCookieOptions, revokeAccessToken } from '../../utils/tokens.js';
import * as authService from './auth.service.js';
import User, { roleLabelFor } from '../../models/User.js';
import Settings from '../../models/Settings.js';
import { HEAD_OFFICE_ID, HEAD_OFFICE_LABEL, HEAD_OFFICE_CODE } from '../../utils/locations.js';
import { emit, revokeSession, userRoom } from '../../config/socket.js';

const storeProfile = (settings) => ({
  siteName: settings.siteName,
  tagline: settings.tagline,
  branding: settings.branding,
  billing: settings.billing,
  features: { branches: settings.features?.branches !== false },
});

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  phoneCountryCode: user.phoneCountryCode || '+91',
  role: user.role,
  roleLabel: user.roleLabel || roleLabelFor(user.role),
  // A Super Admin with no branch is the main one and may change anything. With
  // a branch they still see everything, but only edit inside that branch.
  isMainSuperAdmin: user.role === 'superadmin' && !user.branch,
  avatar: user.avatar,
  isActive: user.isActive,
  lastLoginAt: user.lastLoginAt,
  // No branch means the Head Office — the main business, which is a location in its own right.
  branch: user.branch
    ? {
        id: user.branch._id,
        name: user.branch.name,
        code: user.branch.code,
        address: user.branch.address,
        phone: user.branch.phone,
        phoneCountryCode: user.branch.phoneCountryCode || '+91',
        gstin: user.branch.gstin,
        hasOwnLogo: Boolean(user.branch.hasOwnLogo),
        // Resolved the same way the branch endpoints resolve it: '' means the
        // branch inherits the store's mark.
        effectiveLogo: user.branch.hasOwnLogo ? user.branch.logo?.url || '' : '',
        effectiveFavicon: user.branch.hasOwnLogo ? user.branch.favicon?.url || '' : '',
        logo: user.branch.logo,
        favicon: user.branch.favicon,
        isHeadOffice: false,
      }
    : { id: HEAD_OFFICE_ID, name: HEAD_OFFICE_LABEL, code: HEAD_OFFICE_CODE, isHeadOffice: true },
});

export const loginController = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { user, accessToken, refreshToken } = await authService.login({
    email,
    password,
    userAgent: req.headers['user-agent'],
  });

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());

  return sendSuccess(res, {
    message: `Welcome back, ${user.name.split(' ')[0]}`,
    data: { user: publicUser(user), accessToken, settings: storeProfile(await Settings.getCached()) },
  });
});

export const refreshController = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
  const { user, accessToken, refreshToken } = await authService.refreshSession(
    token,
    req.headers['user-agent']
  );

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());

  return sendSuccess(res, {
    message: 'Session refreshed',
    data: { user: publicUser(user), accessToken, settings: storeProfile(await Settings.getCached()) },
  });
});

export const logoutController = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  await authService.logout(req.user?._id, token);
  revokeAccessToken(req.tokenId);
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
  return sendSuccess(res, { message: 'You have been signed out' });
});

export const meController = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Profile loaded', data: { user: publicUser(req.user) } })
);

export const updateProfileController = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        name: req.body.name,
        phone: req.body.phone ?? '',
        phoneCountryCode: req.body.phoneCountryCode || '+91',
      },
    },
    { new: true, runValidators: true }
  ).populate('branch', 'name code address phone phoneCountryCode gstin isActive hasOwnLogo logo favicon');

  // The same account may be open in another tab — it should not keep showing
  // the old name in the sidebar.
  emit('user:profile', { user: publicUser(user) }, { rooms: [userRoom(user._id)] });

  return sendSuccess(res, { message: 'Profile updated', data: { user: publicUser(user) } });
});

export const changePasswordController = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user._id, req.body);
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });

  // Every other device this account is signed in on is now holding a password
  // that no longer works, so tell them rather than let them find out on a write.
  revokeSession(req.user._id, 'Your password was changed. Please sign in again.');

  return sendSuccess(res, {
    message: 'Password updated. Please sign in again with your new password.',
  });
});

export { publicUser };
