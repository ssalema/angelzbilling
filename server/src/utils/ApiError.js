// Operational (expected) error.
export class ApiError extends Error {
  constructor(statusCode, message, errors = [], isOperational = true, code = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;
    // Optional tag for errors the client must act on (see `sessionEnded`).
    this.code = code;
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

  // The account or its location was disabled mid-session. The client signs out
  // and shows `message` on the sign-in page.
  static sessionEnded(message = 'Your session has ended. Please sign in again.') {
    return new ApiError(403, message, [], true, 'SESSION_ENDED');
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

  // Server is fine but shedding load (e.g. the upload queue is full).
  static serviceUnavailable(message = 'The server is busy. Please try again in a moment.') {
    return new ApiError(503, message);
  }
}

export default ApiError;
