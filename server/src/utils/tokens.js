import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import env from '../config/env.js';

export const signAccessToken = (user) =>
  jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
      branch: user.branch ? String(user.branch._id || user.branch) : null,
      tokenType: 'access',
    },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpires }
  );

export const signRefreshToken = (user) =>
  jwt.sign(
    { sub: String(user._id), tokenType: 'refresh', jti: crypto.randomUUID() },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpires }
  );

export const verifyAccessToken = (token) => jwt.verify(token, env.jwt.accessSecret);
export const verifyRefreshToken = (token) => jwt.verify(token, env.jwt.refreshSecret);

/** Refresh tokens are only ever persisted as a SHA-256 digest. */
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export const REFRESH_COOKIE = 'ap_refresh_token';

const parseDuration = (value) => {
  const match = /^(\d+)([smhd])$/.exec(String(value).trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return Number(match[1]) * units[match[2]];
};

export const refreshCookieMaxAge = () => parseDuration(env.jwt.refreshExpires);

export const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? 'none' : 'lax',
  domain: env.cookieDomain,
  path: '/',
  maxAge: refreshCookieMaxAge(),
});
