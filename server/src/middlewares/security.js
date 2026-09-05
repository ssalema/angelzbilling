import rateLimit from 'express-rate-limit';
import xss from 'xss';
import env from '../config/env.js';

export const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down and try again shortly.' },
});

/** Brute-force protection on the credential endpoints specifically. */
export const authLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.authMax,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many sign-in attempts. Please wait a few minutes before trying again.',
  },
});

/**
 * The refresh endpoint takes no credentials beyond the cookie, so it needs a
 * brake of its own — the global limiter is far too loose for a rotation that a
 * cross-site form post can trigger.
 */
export const refreshLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.refreshMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many session refreshes. Please sign in again.',
  },
});

const sanitiseValue = (value) => {
  if (typeof value === 'string') return xss(value, { whiteList: {}, stripIgnoreTag: true });
  if (Array.isArray(value)) return value.map(sanitiseValue);
  if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => {
      value[key] = sanitiseValue(value[key]);
    });
    return value;
  }
  return value;
};

/**
 * Strips HTML/script payloads out of incoming strings so stored XSS cannot
 * reach a printed bill or the perfume list.
 */
export const xssSanitizer = (req, _res, next) => {
  if (req.body) req.body = sanitiseValue(req.body);
  if (req.params) req.params = sanitiseValue(req.params);
  next();
};
