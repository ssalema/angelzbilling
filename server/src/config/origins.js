import env from './env.js';

// Allowed origins, shared by the REST API and the websocket layer.
export const allowedOrigins = env.adminUrl
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Dev only: allow any localhost port, since Vite may pick a different one.
const isLocalOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

// A missing Origin header means same-origin.
export const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return !env.isProd && isLocalOrigin(origin);
};

export default allowedOrigins;
