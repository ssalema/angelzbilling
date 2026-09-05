import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import morgan from 'morgan';

import env from './config/env.js';
import { httpLogStream } from './config/logger.js';
import { apiLimiter, xssSanitizer } from './middlewares/security.js';
import { notFound, errorHandler } from './middlewares/error.js';
import routes from './routes/index.js';

const app = express();

// Behind a proxy (Render / Nginx) so secure cookies and rate limiting see real
// IPs. Must match the real hop count: trusting more proxies than exist lets a
// caller forge X-Forwarded-For and walk straight through every rate limiter.
app.set('trust proxy', env.trustProxy);
app.disable('x-powered-by');

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Cloudinary images
    contentSecurityPolicy: env.isProd ? undefined : false,
  })
);

const allowedOrigins = env.adminUrl.split(',').map((o) => o.trim()).filter(Boolean);

// Outside production the Vite dev server takes whatever port is free, so pinning
// one localhost origin breaks the moment 5173 is taken. Never relaxed in prod.
const isLocalOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin / curl / server-to-server requests have no Origin header.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      if (!env.isProd && isLocalOrigin(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true, // required for the httpOnly refresh cookie
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  })
);

app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// NoSQL injection: strips $ and . operators out of user supplied objects.
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(xssSanitizer);

app.use(morgan(env.isProd ? 'combined' : 'dev', { stream: httpLogStream }));
app.use(env.apiPrefix, apiLimiter);

app.get('/', (_req, res) => res.type('text/plain').send('Server is Working'));

app.use(env.apiPrefix, routes);

app.use(notFound);
app.use(errorHandler);

export default app;
