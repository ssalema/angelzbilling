import ApiError from '../utils/ApiError.js';
import { branchesOn } from '../utils/featureFlags.js';

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
 * The single source of truth for branch scoping.
 *
 * A superadmin may look at any branch (or all of them via `?branch=all`).
 * Everyone else is silently pinned to their own branch — editing the query
 * string does nothing, because we overwrite it here rather than trust it.
 *
 * Returns the ObjectId to filter on, or null for "no branch filter".
 */
const NO_BRANCH = 'Your account is not assigned to a branch yet. Contact the super admin.';

const OBJECT_ID = /^[a-f\d]{24}$/i;

/** The branch a scoped role is pinned to, or null when it has none. */
const ownBranch = (user) => (user?.branch ? String(user.branch._id || user.branch) : null);

export const resolveBranchScope = (req) => {
  const user = req.user;
  if (!user) return null;

  // A single-location store has no branch dimension at all: nothing is scoped,
  // and an account without a branch is normal rather than a misconfiguration.
  if (!branchesOn(req)) return null;

  if (isSuperAdmin(user)) {
    const requested = req.query.branch || req.body?.branch;
    if (!requested || requested === 'all') return null;
    // Callers feed this straight into `new ObjectId(...)`, which throws a
    // BSONError — not a Mongoose CastError — for a malformed id, and that lands
    // as a 500. A bad branch in the query string is a bad request; say so.
    if (!OBJECT_ID.test(String(requested))) {
      throw ApiError.badRequest(`"${requested}" is not a valid branch id`);
    }
    return requested;
  }

  // Fail closed. `null` here means "no filter — every branch", so a scoped role
  // that somehow lost its branch must be refused rather than handed the lot.
  const own = ownBranch(user);
  if (!own) throw ApiError.forbidden(NO_BRANCH);
  return own;
};

/** Guard for reading/writing one specific branch's data. */
export const assertBranchAccess = (req, branchId) => {
  if (!branchId) return;
  if (!branchesOn(req)) return;
  if (isSuperAdmin(req.user)) return;

  // Same fail-closed rule: no branch means no access, never unchecked access.
  const own = ownBranch(req.user);
  if (!own) throw ApiError.forbidden(NO_BRANCH);
  if (String(branchId) !== own) {
    throw ApiError.forbidden('You can only access records that belong to your branch.');
  }
};
