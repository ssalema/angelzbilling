import mongoose from 'mongoose';

// A store's locations are the Head Office plus every branch.
export const HEAD_OFFICE_ID = 'head-office';
export const HEAD_OFFICE_LABEL = 'Head Office';
export const HEAD_OFFICE_CODE = 'HO';
export const ALL_LOCATIONS = 'all';

const OBJECT_ID = /^[a-f\d]{24}$/i;

/** Head Office can arrive as null, undefined, '' or its id. */
export const isHeadOffice = (value) =>
  value === null || value === undefined || value === '' || String(value) === HEAD_OFFICE_ID;

/** Normalises to a location id: 'head-office' or a branch id. */
export const toLocationId = (value) => (isHeadOffice(value) ? HEAD_OFFICE_ID : String(value));

/** Branch id to store; null for Head Office. */
export const toBranchId = (value) => (isHeadOffice(value) ? null : String(value));

export const isValidLocationId = (value) =>
  String(value) === HEAD_OFFICE_ID || OBJECT_ID.test(String(value));

export const locationFilter = (scope, path) => {
  if (scope === null || scope === undefined) return {};
  if (String(scope) === HEAD_OFFICE_ID) return { [path]: null };
  return { [path]: new mongoose.Types.ObjectId(String(scope)) };
};
