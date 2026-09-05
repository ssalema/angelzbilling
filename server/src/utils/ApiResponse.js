/**
 * One envelope for every successful response so the client never has to guess
 * where the payload lives:  { success, message, data, meta? }
 */
export const sendSuccess = (res, { statusCode = 200, message = 'Success', data = null, meta } = {}) => {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
};

export const sendCreated = (res, { message = 'Created successfully', data = null } = {}) =>
  sendSuccess(res, { statusCode: 201, message, data });

export const sendPaginated = (res, { message = 'Success', items = [], page, limit, total }) =>
  sendSuccess(res, {
    message,
    data: items,
    meta: {
      page,
      limit,
      total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  });
