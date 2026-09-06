/**
 * Operational (expected) error. Anything thrown that is NOT an ApiError is
 * treated as a programming bug by the error handler and hidden from the client.
 */
export class ApiError extends Error {
  constructor(statusCode, message, errors = [], isOperational = true) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', errors = []) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Resource already exists', errors = []) {
    return new ApiError(409, message, errors);
  }

  static unprocessable(message = 'Validation failed', errors = []) {
    return new ApiError(422, message, errors);
  }

  static internal(message = 'Something went wrong') {
    return new ApiError(500, message, [], false);
  }

  /**
   * The server is healthy but deliberately shedding load right now — a full
   * upload queue, say. Operational and retryable, which is exactly what 503
   * means and why this is not a 500: nothing is broken, the client should just
   * come back. Pair it with a Retry-After header at the call site.
   */
  static serviceUnavailable(message = 'The server is busy. Please try again in a moment.') {
    return new ApiError(503, message);
  }
}

export default ApiError;
