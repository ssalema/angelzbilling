import ApiError from './ApiError.js';

// The port opens before the database is connected, so a restart or a deploy
// answers "starting up" at once instead of leaving requests hanging or refused.
let ready = false;

export const markReady = () => {
  ready = true;
};

export const isReady = () => ready;

/** Refuses API calls until boot has finished; /health stays open to report it. */
export const rejectUntilReady = (req, res, next) => {
  if (ready || req.path === '/health') return next();
  res.set('Retry-After', '3');
  return next(
    new ApiError(503, 'The server is starting up. Please try again in a few seconds.', [], true, 'SERVER_STARTING')
  );
};

export default rejectUntilReady;
