/**
 * Wraps an async route handler so a rejected promise reaches the Express error
 * handler instead of hanging the request. Every controller is wrapped in this.
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
