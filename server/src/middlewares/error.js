import mongoose from 'mongoose';
import multer from 'multer';
import env from '../config/env.js';
import logger from '../config/logger.js';
import ApiError from '../utils/ApiError.js';

export const notFound = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
};

/** Translates driver / library errors into the one response envelope. */
const normalise = (err) => {
  if (err instanceof ApiError) return err;

  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return ApiError.unprocessable('Please correct the highlighted fields', errors);
  }

  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`"${err.value}" is not a valid ${err.path}`);
  }

  // `new ObjectId('nonsense')` throws a BSONError, not a CastError, and it is
  // never a server fault — it is a malformed id somebody put in the request.
  if (err.name === 'BSONError' || err.name === 'BSONTypeError') {
    return ApiError.badRequest('That id is not valid');
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const value = err.keyValue?.[field];
    return ApiError.conflict(`${field === 'sku' ? 'SKU' : field} "${value}" is already in use`, [
      { field, message: 'Already exists' },
    ]);
  }

  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: 'The file is too large',
      LIMIT_FILE_COUNT: 'Too many files in one upload',
      LIMIT_UNEXPECTED_FILE: `Unexpected file field "${err.field}"`,
    };
    return ApiError.badRequest(messages[err.code] || 'File upload failed');
  }

  if (err.name === 'JsonWebTokenError') return ApiError.unauthorized('Invalid authentication token');
  if (err.name === 'TokenExpiredError') return ApiError.unauthorized('Your session has expired');

  return new ApiError(err.statusCode || 500, err.message || 'Something went wrong', [], false);
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  const error = normalise(err);

  if (!error.isOperational || error.statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} — ${err.message}`, { stack: err.stack });
  } else {
    logger.warn(`${req.method} ${req.originalUrl} — ${error.statusCode} ${error.message}`);
  }

  const body = {
    success: false,
    // Never leak an unexpected internal message to the client in production.
    message:
      error.statusCode >= 500 && env.isProd ? 'Something went wrong. Please try again.' : error.message,
    errors: error.errors?.length ? error.errors : undefined,
  };

  if (!env.isProd && error.statusCode >= 500) body.stack = err.stack;

  res.status(error.statusCode || 500).json(body);
};
