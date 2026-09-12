import User from '../../models/User.js';
import { revokeSession } from '../../config/socket.js';
import { invalidateUser } from '../../utils/userCache.js';
import { BRANCH_INACTIVE_MESSAGE } from '../../utils/branchAccess.js';

/**
 * Closing a location signs its people out on the spot rather than waiting for
 * them to sign out themselves: the refresh tokens go, the cached copy of each
 * account goes so the very next request is refused, and every open tab is told
 * why in the same words the sign-in page will show.
 *
 * Super Admins are left alone — they are the ones who reopen the location.
 */
export const signOutBranchUsers = async (branchIds) => {
  const ids = (Array.isArray(branchIds) ? branchIds : [branchIds]).filter(Boolean);
  if (!ids.length) return 0;

  const affected = await User.find({ branch: { $in: ids }, role: { $ne: 'superadmin' } })
    .select('_id')
    .lean();
  if (!affected.length) return 0;

  await User.updateMany(
    { _id: { $in: affected.map((user) => user._id) } },
    { $set: { refreshTokens: [] } }
  );

  affected.forEach(({ _id }) => {
    invalidateUser(_id);
    revokeSession(_id, BRANCH_INACTIVE_MESSAGE, 'error');
  });

  return affected.length;
};

export default signOutBranchUsers;
