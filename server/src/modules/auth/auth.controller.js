import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import { REFRESH_COOKIE, refreshCookieOptions } from '../../utils/tokens.js';
import * as authService from './auth.service.js';
import User from '../../models/User.js';

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  phoneCountryCode: user.phoneCountryCode || '+91',
  role: user.role,
  roleLabel: user.roleLabel,
  avatar: user.avatar,
  isActive: user.isActive,
  lastLoginAt: user.lastLoginAt,
  branch: user.branch
    ? {
        id: user.branch._id,
        name: user.branch.name,
        code: user.branch.code,
        address: user.branch.address,
        phone: user.branch.phone,
        phoneCountryCode: user.branch.phoneCountryCode || '+91',
        gstin: user.branch.gstin,
      }
    : null,
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
    data: { user: publicUser(user), accessToken },
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
    data: { user: publicUser(user), accessToken },
  });
});

export const logoutController = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  await authService.logout(req.user?._id, token);
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
  ).populate('branch', 'name code address phone phoneCountryCode gstin hasOwnLogo logo');

  return sendSuccess(res, { message: 'Profile updated', data: { user: publicUser(user) } });
});

export const changePasswordController = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user._id, req.body);
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
  return sendSuccess(res, {
    message: 'Password updated. Please sign in again with your new password.',
  });
});

export { publicUser };
