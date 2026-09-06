import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import xss from 'xss';
import env from '../config/env.js';
import { getRedis } from '../config/redis.js';

/**
 * Where the request counters live.
 *
 * express-rate-limit's default store is a Map in the process, so every API
 * instance counts separately: two instances behind a load balancer hand each
 * caller twice the configured allowance, and the auth limiter — the one
 * genuinely holding back password guessing — is the one that matters most.
 * With REDIS_URL set the counters are shared and the configured number is the
 * real number, whatever the instance count.
 *
 * Built per limiter because each needs its own key prefix; without one they
 * would share counters and a login attempt would consume the global budget.
 */
const storeFor = (prefix) => {
  const redis = getRedis();
  if (!redis) return undefined; // in-process MemoryStore — correct for one instance

  const store = new RedisStore({
    prefix: `rl:${prefix}:`,
    // ioredis takes the command and its args positionally.
    sendCommand: (...args) => redis.call(...args),
  });

  // The constructor above fires two SCRIPT LOADs and parks the promises on the
  // store without awaiting them. Nothing attaches a handler until the first
  // request, so a Redis that is unreachable at startup becomes an unhandled
  // rejection and takes the process down before it can serve anything. Absorb
  // that here: `retryableIncrement` reloads the script the first time EVALSHA
  // fails, so the store repairs itself once Redis is reachable again.
  store.incrementScriptSha?.catch?.(() => {});
  store.getScriptSha?.catch?.(() => {});

  return store;
};

/**
 * What happens when the store itself fails — only reachable with Redis set.
 *
 * express-rate-limit's default is to surface a store error as a 500, which
 * would turn a Redis blip into a total outage of every rate limited route.
 * Letting the request through instead keeps the app up, at the cost of running
 * unlimited for the duration of the outage. That is the intended trade for the
 * general limiters; see `authLimiter` for why it is not obviously right there.
 */
const passOnStoreError = true;

export const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  store: storeFor('api'),
  passOnStoreError,
  message: { success: false, message: 'Too many requests. Please slow down and try again shortly.' },
});

/** Brute-force protection on the credential endpoints specifically. */
export const authLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.authMax,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  store: storeFor('auth'),
  // Fails open: while Redis is unreachable, password guessing is unthrottled.
  // The alternative — 500 on every sign-in — locks every user out for the same
  // window, so this stays open. Flip it to `false` if an unthrottled window is
  // the worse risk for this deployment.
  passOnStoreError,
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
  store: storeFor('refresh'),
  passOnStoreError,
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
