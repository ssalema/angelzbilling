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

/**
 * Seeing and changing are two different questions.
 *
 * EVERY super admin sees the whole system — branches, users, bills, dashboard,
 * settings. That is what the role means, and the read guards below never narrow
 * one down. What a branch assignment changes is *authority*: a super admin
 * pinned to a branch may only write inside it.
 *
 * A super admin with no branch is the main one: unrestricted, and the only
 * account that may touch the main business identity in Settings, the branch
 * registry itself, or another branch's team.
 */
export const isGlobalSuperAdmin = (user) => isSuperAdmin(user) && !user?.branch;
export const isBranchSuperAdmin = (user) => isSuperAdmin(user) && Boolean(user?.branch);

/**
 * The single source of truth for location scoping.
 *
 * A super admin may look at any location, or all of them via `?branch=all`.
 * Everyone else is silently pinned to their own — editing the query string does
 * nothing, because we overwrite it here rather than trust it.
 *
 * Returns `null` for "every location", `HEAD_OFFICE_ID` for the main business,
 * or a branch ObjectId. Feed the result to `locationFilter` rather than testing
 * it by hand: null and Head Office are different answers, not the same one.
 */
const LOCATION_ONLY = 'You can only make changes within your own location.';
const MAIN_ONLY =
  'Only the main Super Admin can change this. Your account is assigned to a branch, so it manages that branch only.';

/** The branch a user is pinned to, or null for the Head Office. */
export const ownBranch = (user) => (user?.branch ? String(user.branch._id || user.branch) : null);

/** The same thing as a location id, so the Head Office compares like any branch. */
export const ownLocation = (user) => toLocationId(ownBranch(user));

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
    // `locationFilter` feeds a branch id straight into `new ObjectId(...)`, which
    // throws a BSONError — not a Mongoose CastError — for a malformed one, and
    // that lands as a 500. A bad location in the query string is a bad request.
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

/**
 * Guard for CHANGING something that belongs to one location.
 *
 * The read guard above waves every super admin through; this one does not — a
 * branch super admin is held to their own branch exactly like a branch admin.
 * The Head Office Super Admin (no branch) is the one account with no ceiling.
 */
export const assertBranchWrite = (req, branchId) => {
  if (isGlobalSuperAdmin(req.user)) return;

  // Branches off: records carry no location, so there is nothing to scope a
  // write to and admins and staff keep exactly the reach they always had.
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

/**
 * Guard for store-wide changes: the main business record (which is also the Head
 * Office's own details) and the branch registry.
 */
export const assertGlobalWrite = (req, message = MAIN_ONLY) => {
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
