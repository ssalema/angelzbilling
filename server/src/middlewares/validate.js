import { ZodError } from 'zod';
import ApiError from '../utils/ApiError.js';

// Zod validation middleware.
export const validate = (schemas) => (req, _res, next) => {
  try {
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    if (schemas.params) req.params = schemas.params.parse(req.params ?? {});
    if (schemas.query) {
      // req.query is a getter in Express 5 style setups — assign field by field.
      const parsed = schemas.query.parse(req.query ?? {});
      Object.keys(parsed).forEach((key) => {
        req.query[key] = parsed[key];
      });
      req.validatedQuery = parsed;
    }
    return next();
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = error.errors.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      }));
      return next(ApiError.unprocessable('Please correct the highlighted fields', errors));
    }
    return next(error);
  }
};

export default validate;
