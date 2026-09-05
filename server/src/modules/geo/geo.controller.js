import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { listStates, listCities, lookupPostalCode } from './geo.service.js';

export const getStates = asyncHandler(async (req, res) => {
  const states = await listStates(req.query.country);
  return sendSuccess(res, { message: 'States fetched', data: states });
});

export const getCities = asyncHandler(async (req, res) => {
  const cities = await listCities(req.query.country, req.query.state);
  return sendSuccess(res, { message: 'Cities fetched', data: cities });
});

export const getPostalCode = asyncHandler(async (req, res) => {
  const match = await lookupPostalCode(req.query.country, req.query.code);
  if (!match) throw ApiError.notFound('No address found for that postal code');
  return sendSuccess(res, { message: 'Address found', data: match });
});
