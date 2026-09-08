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

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
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

  /**
   * How many proxies sit in front of the API. express-rate-limit derives the
   * client IP from X-Forwarded-For, so an over-count lets a caller spoof that
   * header and reset every limiter at will. Set it to the real hop count.
   */
  trustProxy: toInt(process.env.TRUST_PROXY_HOPS, 1),

  rateLimit: {
    windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 15) * 60 * 1000,
    max: toInt(process.env.RATE_LIMIT_MAX, 500),
    authMax: toInt(process.env.AUTH_RATE_LIMIT_MAX, 20),
    refreshMax: toInt(process.env.REFRESH_RATE_LIMIT_MAX, 60),
  },
};

export default env;
