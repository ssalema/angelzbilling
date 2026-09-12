// Operational (expected) error.
export class ApiError extends Error {
  constructor(statusCode, message, errors = [], isOperational = true, code = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;
    // An optional tag for the few failures the client has to act on rather than
    // merely report. See `sessionEnded`.
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

  // Refused because the session itself is no longer usable — the account, or the
  // location it sits at, was switched off while the person was working. The
  // client signs out on this tag and shows `message` on the sign-in page rather
  // than leaving someone clicking around a screen that can no longer load.
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

  // The server is healthy but deliberately shedding load right now — a full upload queue, say.
  static serviceUnavailable(message = 'The server is busy. Please try again in a moment.') {
    return new ApiError(503, message);
  }
}

export default ApiError;
