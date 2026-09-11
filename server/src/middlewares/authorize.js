import ApiError from '../utils/ApiError.js';
import { branchesOn } from '../utils/featureFlags.js';
import { HEAD_OFFICE_ID, ALL_LOCATIONS, isValidLocationId, toLocationId } from '../utils/locations.js';

/**
 * Role gate. `authorize('superadmin')` or `authorize('superadmin', 'admin')`.
 */
export const authorize =
  (...allowedRoles) =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowedRoles.length || allowedRoles.includes(req.user.role)) return next();
    return next(
      ApiError.forbidden(
        `This action is restricted to ${allowedRoles.map(labelFor).join(' / ')} accounts.`
      )
    );
  };

const labelFor = (role) =>
  ({ superadmin: 'Super Admin', admin: 'Branch Admin', staff: 'Billing Staff' }[role] || role);

const isSuperAdmin = (user) => user?.role === 'superadmin';

// Seeing and changing are two different questions.
export const isGlobalSuperAdmin = (user) => isSuperAdmin(user) && !user?.branch;
const isBranchSuperAdmin = (user) => isSuperAdmin(user) && Boolean(user?.branch);

// The single source of truth for location scoping.
const LOCATION_ONLY = 'You can only make changes within your own location.';
const MAIN_ONLY =
  'Only the main Super Admin can change this. Your account is assigned to a branch, so it manages that branch only.';

/** The branch a user is pinned to, or null for the Head Office. */
export const ownBranch = (user) => (user?.branch ? String(user.branch._id || user.branch) : null);

/** The same thing as a location id, so the Head Office compares like any branch. */
const ownLocation = (user) => toLocationId(ownBranch(user));

export const resolveBranchScope = (req) => {
  const user = req.user;
  if (!user) return null;

  // A single-location store has no location dimension at all: nothing is scoped,
  // and every record belongs to the one business.
  if (!branchesOn(req)) return null;

  // Reading is store-wide for every super admin, branch-assigned or not.
  if (isSuperAdmin(user)) {
    const requested = req.query.branch || req.body?.branch;
    if (!requested || requested === ALL_LOCATIONS) return null;
    if (!isValidLocationId(requested)) {
      throw ApiError.badRequest(`"${requested}" is not a valid location`);
    }
    return toLocationId(requested);
  }

  // Everyone else sees their own location and only that. No branch is not a
  // misconfiguration any more — it means the Head Office.
  return ownLocation(user);
};

/** Guard for READING one location's data. Any super admin passes. */
export const assertBranchAccess = (req, branchId) => {
  if (!branchesOn(req)) return;
  if (isSuperAdmin(req.user)) return;

  if (ownLocation(req.user) !== toLocationId(branchId)) {
    throw ApiError.forbidden('You can only access records that belong to your location.');
  }
};

// Guard for CHANGING something that belongs to one location.
export const assertBranchWrite = (req, branchId) => {
  if (isGlobalSuperAdmin(req.user)) return;

  // Branches off: records carry no location, so admins and staff keep their usual
  // reach. A super admin pinned to a branch is still held to it either way.
  if (!branchesOn(req) && !isSuperAdmin(req.user)) return;

  const own = ownLocation(req.user);
  const target = toLocationId(branchId);
  if (own === target) return;

  // A branch super admin reaching for the Head Office is reaching for the main
  // business, so say that rather than talking about branches.
  throw ApiError.forbidden(
    target === HEAD_OFFICE_ID && isBranchSuperAdmin(req.user) ? MAIN_ONLY : LOCATION_ONLY
  );
};

const assertGlobalWrite = (req, message = MAIN_ONLY) => {
  if (!isGlobalSuperAdmin(req.user)) throw ApiError.forbidden(message);
};

/** Route-level form of `assertGlobalWrite`, for endpoints that are global end to end. */
export const requireGlobalSuperAdmin = (message) => (req, _res, next) => {
  try {
    assertGlobalWrite(req, message);
    return next();
  } catch (error) {
    return next(error);
  }
};
