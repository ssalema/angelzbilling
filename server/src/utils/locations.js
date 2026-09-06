import mongoose from 'mongoose';

/**
 * A store's locations are the Head Office plus every branch.
 *
 * The Head Office is not a Branch document and never gets one — it IS the main
 * business, the single Settings record with the store's name, address, GSTIN and
 * logo. Anything carrying no branch belongs to it. So a null branch means "Head
 * Office", not "everywhere": "all" is a filter word only, and nothing is ever
 * assigned to it.
 *
 * With branch management switched off there is only the main business, and none
 * of this applies — nothing is scoped and nothing is labelled.
 */
export const HEAD_OFFICE_ID = 'head-office';
export const HEAD_OFFICE_LABEL = 'Head Office';
export const HEAD_OFFICE_CODE = 'HO';
export const ALL_LOCATIONS = 'all';

const OBJECT_ID = /^[a-f\d]{24}$/i;

/** True for every way the Head Office reaches us: null, undefined or its id. */
export const isHeadOffice = (value) =>
  value === null || value === undefined || value === '' || String(value) === HEAD_OFFICE_ID;

/** Anything the API is handed, as a location id: 'head-office' or a branch id. */
export const toLocationId = (value) => (isHeadOffice(value) ? HEAD_OFFICE_ID : String(value));

/** The branch ObjectId to store — null when it is the Head Office. */
export const toBranchId = (value) => (isHeadOffice(value) ? null : String(value));

export const isValidLocationId = (value) =>
  String(value) === HEAD_OFFICE_ID || OBJECT_ID.test(String(value));

/**
 * The Mongo condition for a resolved scope, on whichever path holds the branch
 * ('branch.id' on a bill, 'branch' on a user). `null` means every location, so
 * it contributes no condition at all.
 */
export const locationFilter = (scope, path) => {
  if (scope === null || scope === undefined) return {};
  if (String(scope) === HEAD_OFFICE_ID) return { [path]: null };
  return { [path]: new mongoose.Types.ObjectId(String(scope)) };
};

/** How a branch document (or its absence) is named for a human. */
export const locationLabel = (branch) => branch?.name || HEAD_OFFICE_LABEL;
