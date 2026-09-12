// A closed location shuts out the people scoped to it. The rule and its wording
// live here so the sign-in check, the request gate, the socket handshake and the
// notice pushed to an open tab all say the same thing.

export const BRANCH_INACTIVE_MESSAGE = 'Your branch is currently inactive. Please contact the super admin.';

/**
 * True when this account cannot work right now because its location is out of
 * service. A Super Admin runs the store rather than a counter, so they keep
 * working and can switch the location back on.
 */
export const isBranchInactive = (user) =>
  Boolean(user) && user.role !== 'superadmin' && Boolean(user.branch) && user.branch.isActive === false;

export default isBranchInactive;
