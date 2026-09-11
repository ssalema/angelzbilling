import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import morgan from 'morgan';

import env from './config/env.js';
import { httpLogStream } from './config/logger.js';
import allowedOrigins, { isAllowedOrigin } from './config/origins.js';
import { apiLimiter, xssSanitizer, verifyOrigin } from './middlewares/security.js';
import { collectMetrics, startLagSampler } from './middlewares/metrics.js';
import { notFound, errorHandler } from './middlewares/error.js';
import ApiError from './utils/ApiError.js';
import routes from './routes/index.js';

const app = express();

// Behind a proxy (Render / Nginx) so secure cookies and rate limiting see real IPs.
app.set('trust proxy', env.trustProxy);
app.disable('x-powered-by');

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Cloudinary images
    // Its own switch rather than a read of NODE_ENV, and on unless a local
    // developer asks for it to be off. See config/env.js.
    contentSecurityPolicy: env.cspEnabled ? undefined : false,
  })
);

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin / curl / server-to-server requests have no Origin header.
      // The websocket handshake is held to the same list. See config/origins.js.
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(ApiError.forbidden(`Origin ${origin} is not allowed to call this API.`));
    },
    credentials: true, // required for the httpOnly refresh cookie
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  })
);

app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

app.use(verifyOrigin(allowedOrigins));

// NoSQL injection: strips $ and . operators out of user supplied objects.
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(xssSanitizer);

// Access logging, with the personal data left out of it.
const SENSITIVE_QUERY_KEYS = new Set(['mobile', 'q', 'search', 'code', 'email', 'phone', 'token']);

const redactUrl = (value) => {
  const raw = String(value || '');
  const split = raw.indexOf('?');
  if (split === -1) return raw;

  const params = new URLSearchParams(raw.slice(split + 1));
  let touched = false;
  for (const key of [...params.keys()]) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase()) && params.get(key)) {
      params.set(key, '[redacted]');
      touched = true;
    }
  }
  return touched ? `${raw.slice(0, split)}?${decodeURIComponent(params.toString())}` : raw;
};

morgan.token('safe-url', (req) => redactUrl(req.originalUrl || req.url));
// Who made the call.
morgan.token('actor', (req) => (req.user ? `${req.user._id}:${req.user.role}` : '-'));

const ACCESS_LOG_FORMAT = env.isProd
  ? ':remote-addr :actor ":method :safe-url HTTP/:http-version" :status :res[content-length] :response-time ms'
  : ':method :safe-url :status :response-time ms - :res[content-length]';

app.use(morgan(ACCESS_LOG_FORMAT, { stream: httpLogStream }));

// Ahead of the limiter so a rejected request is counted too — a flood of 429s is
// exactly the thing worth being able to see. See middlewares/metrics.js.
app.use(env.apiPrefix, collectMetrics);
startLagSampler();

app.use(env.apiPrefix, apiLimiter);

app.get('/', (_req, res) => res.type('text/plain').send('Server is Working'));

app.use(env.apiPrefix, routes);

app.use(notFound);
app.use(errorHandler);

export default app;
