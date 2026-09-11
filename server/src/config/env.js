import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const required = ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  // Fail fast and loudly — a half configured auth system is worse than none.
  console.error(
    `\n[config] Missing required environment variables: ${missing.join(', ')}\n` +
      `[config] Copy server/.env.example to server/.env and fill them in.\n`
  );
  process.exit(1);
}

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// A tri-state boolean: an unset variable keeps the default, anything else is read literally.
const toBool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';
const isDev = nodeEnv === 'development';

// The panel and the API are on different origins in production, and `none` is the
// only SameSite a browser sends cross-site. Set it to `lax` once they share one.
const cookieSameSite = (process.env.COOKIE_SAMESITE || (isProd ? 'none' : 'lax')).toLowerCase();

// A browser rejects SameSite=None without this.
const cookieSecure = toBool(process.env.COOKIE_SECURE, !isDev || cookieSameSite === 'none');

export const env = {
  nodeEnv,
  isProd,
  isDev,
  port: toInt(process.env.PORT, 5000),
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  mongoUri: process.env.MONGODB_URI,

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  },

  adminUrl: process.env.ADMIN_URL || 'http://localhost:5173',
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,

  // `Secure` and `SameSite` on the refresh cookie. See the notes above.
  cookieSecure,
  cookieSameSite,

  /** Content-Security-Policy on API responses. Off only for local debugging. */
  cspEnabled: toBool(process.env.ENABLE_CSP, !isDev),

  // The websocket layer. Off is a supported deployment: the panel falls back to
  // reloading on its own, it just stops being live. See config/socket.js.
  realtime: {
    enabled: toBool(process.env.ENABLE_REALTIME, true),
    path: process.env.SOCKET_PATH || '/socket.io',
    pingIntervalMs: toInt(process.env.SOCKET_PING_INTERVAL_MS, 25_000),
    pingTimeoutMs: toInt(process.env.SOCKET_PING_TIMEOUT_MS, 20_000),
  },

  // Whether a 500 carries its stack back to the caller.
  exposeErrorStacks: toBool(process.env.EXPOSE_ERROR_STACKS, isDev),

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    folder: process.env.CLOUDINARY_FOLDER || 'angelzdesire',
    get enabled() {
      return Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
          process.env.CLOUDINARY_API_KEY &&
          process.env.CLOUDINARY_API_SECRET
      );
    },
  },

  geo: {
    countriesNowUrl: process.env.GEO_COUNTRIES_NOW_URL || 'https://countriesnow.space/api/v0.1',
    indiaPostUrl: process.env.GEO_INDIA_POST_URL || 'https://api.postalpincode.in/pincode',
    zippopotamUrl: process.env.GEO_ZIPPOPOTAM_URL || 'https://api.zippopotam.us',
    timeoutMs: toInt(process.env.GEO_TIMEOUT_MS, 8000),
  },

  // How many proxies sit in front of the API — Render and Nginx are one each.
  // Rate limiting reads the client IP off X-Forwarded-For, so it must match reality:
  // too high lets a caller forge that header, too low makes everyone share a counter.
  trustProxy: toInt(process.env.TRUST_PROXY_HOPS, 1),
  trustProxyConfigured: process.env.TRUST_PROXY_HOPS !== undefined,

  // How many worker processes `npm run start:cluster` should run.
  workers: toInt(process.env.WEB_CONCURRENCY, 0),

  rateLimit: {
    windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 15) * 60 * 1000,
    max: toInt(process.env.RATE_LIMIT_MAX, 500),
    authMax: toInt(process.env.AUTH_RATE_LIMIT_MAX, 20),
    refreshMax: toInt(process.env.REFRESH_RATE_LIMIT_MAX, 60),
    lookupMax: toInt(process.env.LOOKUP_RATE_LIMIT_MAX, 120),
  },
};

// Configuration that is legal but probably not what anyone meant.
export const configWarnings = () => {
  const warnings = [];

  if (!process.env.NODE_ENV) {
    warnings.push(
      'NODE_ENV is not set, so this process is running in development mode. ' +
        'Set NODE_ENV=production on a deployed server.'
    );
  }

  if (isProd && !env.trustProxyConfigured) {
    warnings.push(
      'TRUST_PROXY_HOPS is not set, so one proxy hop is assumed (correct for Render, ' +
        'and for Nginx or Apache in front of the app). Set it to the real hop count: ' +
        'too high lets a caller forge X-Forwarded-For past every rate limiter, ' +
        'too low makes every caller share one counter. Use 0 only if nothing sits in front.'
    );
  }

  if (env.cookieSameSite === 'none' && !env.cookieSecure) {
    warnings.push('COOKIE_SAMESITE=none requires COOKIE_SECURE=true — browsers reject the cookie otherwise.');
  }

  if (isProd && !env.cookieSecure) {
    warnings.push('COOKIE_SECURE is off in production — the refresh cookie will travel over plain HTTP.');
  }

  if (isProd && env.exposeErrorStacks) {
    warnings.push('EXPOSE_ERROR_STACKS is on in production — stack traces are being returned to clients.');
  }

  if (!env.realtime.enabled) {
    warnings.push(
      'ENABLE_REALTIME is off — the panel will not receive live updates and each ' +
        'screen will only be as current as its last request.'
    );
  }

  if (isProd && !env.cspEnabled) {
    warnings.push('ENABLE_CSP is off in production — API responses carry no Content-Security-Policy.');
  }

  const weak = ['replace_me_with_a_long_random_string', 'replace_me_with_a_different_long_random_string'];
  if (weak.includes(env.jwt.accessSecret) || weak.includes(env.jwt.refreshSecret)) {
    warnings.push('A JWT secret is still the placeholder from .env.example. Replace both with long random values.');
  }
  if (env.jwt.accessSecret === env.jwt.refreshSecret) {
    warnings.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are identical — they must be different values.');
  }
  if (env.jwt.accessSecret.length < 32 || env.jwt.refreshSecret.length < 32) {
    warnings.push('A JWT secret is shorter than 32 characters. Use at least 32 random characters.');
  }

  return warnings;
};

export default env;
