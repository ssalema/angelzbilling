import User from '../../models/User.js';
import { revokeSession } from '../../config/socket.js';
import { invalidateUser } from '../../utils/userCache.js';
import { BRANCH_INACTIVE_MESSAGE } from '../../utils/branchAccess.js';

// Signs out a deactivated branch's users right away (clears tokens and cache,
// notifies open tabs). Super Admins are skipped so they can reopen the branch.
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
