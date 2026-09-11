import env from './env.js';

// Who is allowed to call this API — read once and shared, so the REST layer and
// the websocket layer can never drift apart on the question.

export const allowedOrigins = env.adminUrl
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Outside production the Vite dev server takes whatever port is free, so pinning
// one localhost origin breaks the moment 5173 is taken. Never relaxed in prod.
const isLocalOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

/** True for an Origin header this deployment accepts. A missing one is same-origin. */
export const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return !env.isProd && isLocalOrigin(origin);
};

export default allowedOrigins;
