import cluster from 'node:cluster';
import os from 'node:os';
import rateLimit from 'express-rate-limit';
import xss from 'xss';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

// Where the request counters live.

// How many processes are sharing these counters, and therefore dividing them.
const SHARING_WORKERS = cluster.isWorker
  ? env.workers > 0
    ? env.workers
    : os.availableParallelism?.() || os.cpus().length
  : 1;

/** Never below one, or a well-provisioned box would refuse every request. */
const perWorker = (limit) => Math.max(1, Math.ceil(limit / SHARING_WORKERS));

export const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: perWorker(env.rateLimit.max),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down and try again shortly.' },
});

/** Brute-force protection on the credential endpoints specifically. */
export const authLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: perWorker(env.rateLimit.authMax),
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many sign-in attempts. Please wait a few minutes before trying again.',
  },
});

export const refreshLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: perWorker(env.rateLimit.refreshMax),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many session refreshes. Please sign in again.',
  },
});

// Reading the customer directory.
export const lookupLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: perWorker(env.rateLimit.lookupMax),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?._id || req.ip),
  message: {
    success: false,
    message: 'Too many customer lookups. Please wait a few minutes before searching again.',
  },
});

// Cross-site request forgery cover for anything the browser authenticates with a cookie.
export const verifyOrigin = (allowedOrigins = []) => {
  const permitted = new Set(allowedOrigins);

  const isAcceptable = (value) => {
    if (!value) return true; // non-browser caller; a browser cannot fake this
    if (permitted.has(value)) return true;
    // The same allowance the CORS layer makes, and for the same reason: the
    // Vite dev server picks whatever port is free. Never granted in production.
    return !env.isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(value);
  };

  const originOf = (value) => {
    if (!value) return '';
    try {
      return new URL(value).origin;
    } catch {
      return value;
    }
  };

  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

    const origin = req.headers.origin;
    // Referer is the fallback for the handful of browsers that omit Origin on
    // same-origin posts; only its origin component is compared.
    const source = origin || originOf(req.headers.referer);

    if (isAcceptable(source)) return next();

    return next(
      ApiError.forbidden('This request did not come from the admin panel and was refused.')
    );
  };
};

const XSS_OPTIONS = { whiteList: {}, stripIgnoreTag: true };

// The only characters this configuration can change.
const COULD_CARRY_MARKUP = /[<>&"']/;

// Bounds on how much structure one request may ask this to walk.
const MAX_DEPTH = 12;
const MAX_NODES = 200_000;

const tooComplex = () =>
  ApiError.badRequest('That request is too deeply nested to process. Please send it in smaller parts.');

const sanitiseValue = (value, state, depth) => {
  if (depth > MAX_DEPTH) throw tooComplex();
  if ((state.nodes += 1) > MAX_NODES) throw tooComplex();

  if (typeof value === 'string') {
    return COULD_CARRY_MARKUP.test(value) ? xss(value, XSS_OPTIONS) : value;
  }
  if (Array.isArray(value)) return value.map((entry) => sanitiseValue(entry, state, depth + 1));
  if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => {
      value[key] = sanitiseValue(value[key], state, depth + 1);
    });
    return value;
  }
  return value;
};

export const xssSanitizer = (req, _res, next) => {
  const state = { nodes: 0 };
  if (req.body) req.body = sanitiseValue(req.body, state, 0);
  if (req.params) req.params = sanitiseValue(req.params, state, 0);
  next();
};
