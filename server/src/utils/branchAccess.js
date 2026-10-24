// Shared rule and message for blocking users of an inactive branch
// (sign-in, requests, socket handshake, live notices).

export const BRANCH_INACTIVE_MESSAGE = 'Your branch is currently inactive. Please contact the super admin.';

/** True when the user's branch is inactive. Super Admins are never blocked, so they can reactivate it. */
export const isBranchInactive = (user) =>
  Boolean(user) && user.role !== 'superadmin' && Boolean(user.branch) && user.branch.isActive === false;

export default isBranchInactive;
