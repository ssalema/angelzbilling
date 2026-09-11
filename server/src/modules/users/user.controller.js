import User from '../../models/User.js';
import Branch from '../../models/Branch.js';
import Bill from '../../models/Bill.js';
import ApiError from '../../utils/ApiError.js';
import { branchesOn } from '../../utils/featureFlags.js';
import { isGlobalSuperAdmin, assertBranchWrite, ownBranch } from '../../middlewares/authorize.js';
import {
  HEAD_OFFICE_ID,
  HEAD_OFFICE_LABEL,
  HEAD_OFFICE_CODE,
  ALL_LOCATIONS,
  toBranchId,
  locationFilter,
} from '../../utils/locations.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/ApiResponse.js';
import { getPagination, getSort, escapeRegex, round2 } from '../../utils/query.js';

const SORTABLE = ['createdAt', 'name', 'email', 'role', 'lastLoginAt'];

// Who may CHANGE an account.
const assertCanManageUser = (req, target) => {
  if (isGlobalSuperAdmin(req.user)) return;
  if (target.role === 'superadmin') {
    throw ApiError.forbidden('Only the main Super Admin can change a Super Admin account.');
  }
  assertBranchWrite(req, target.branch?._id || target.branch);
};

const assertAnotherMainSuperAdminRemains = async (excludeId) => {
  const remaining = await User.countDocuments({
    role: 'superadmin',
    branch: null,
    isActive: true,
    _id: { $ne: excludeId },
  });
  if (remaining === 0) {
    throw ApiError.badRequest(
      'At least one active main Super Admin — a Super Admin with no branch assigned — must remain. ' +
        'They are the only account that can change the main business details.'
    );
  }
};

const shape = (user, stats = {}) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone || '',
  phoneCountryCode: user.phoneCountryCode || '+91',
  role: user.role,
  roleLabel: { superadmin: 'Super Admin', admin: 'Branch Admin', staff: 'Billing Staff' }[user.role],
  // No branch is an assignment, not a gap: it means the Head Office. Shaping it
  // here keeps every table, chip and picker reading one location structure.
  branch: user.branch
    ? { id: user.branch._id, name: user.branch.name, code: user.branch.code, isHeadOffice: false }
    : { id: HEAD_OFFICE_ID, name: HEAD_OFFICE_LABEL, code: HEAD_OFFICE_CODE, isHeadOffice: true },
  // A Super Admin with no branch is the main one: full authority store-wide.
  // With a branch, they still see everything but only edit inside it.
  isMainSuperAdmin: user.role === 'superadmin' && !user.branch,
  avatar: user.avatar,
  isActive: user.isActive,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
  billCount: stats.count || 0,
  billTotal: round2(stats.total || 0),
});

export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { search, role, status, branch, sort } = req.query;

  const filter = {};
  if (role !== 'all') filter.role = role;
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;
  // "all" is a filter word only — no account is ever assigned to it.
  if (branch && branch !== ALL_LOCATIONS) Object.assign(filter, locationFilter(branch, 'branch'));
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .populate('branch', 'name code')
      .sort(getSort(sort, SORTABLE))
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  // The reference UI shows "N order(s) · ₹X" under each name.
  const ids = items.map((u) => u._id);
  const stats = await Bill.aggregate([
    { $match: { 'billedBy.id': { $in: ids }, status: 'paid' } },
    { $group: { _id: '$billedBy.id', count: { $sum: 1 }, total: { $sum: '$grandTotal' } } },
  ]);
  const statMap = Object.fromEntries(stats.map((s) => [String(s._id), s]));

  return sendPaginated(res, {
    message: 'Users loaded',
    items: items.map((u) => shape(u, statMap[String(u._id)])),
    page,
    limit,
    total,
  });
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).populate('branch', 'name code').lean();
  if (!user) throw ApiError.notFound('User not found');
  return sendSuccess(res, { message: 'User loaded', data: shape(user) });
});

export const createUser = asyncHandler(async (req, res) => {
  const { email, branch, role } = req.body;

  // A Super Admin assigned to a branch builds that branch's team, and cannot
  // mint another Super Admin — that is a store-wide grant.
  if (!isGlobalSuperAdmin(req.user)) {
    if (role === 'superadmin') {
      throw ApiError.forbidden('Only the main Super Admin can create Super Admin accounts.');
    }
    assertBranchWrite(req, branchesOn(req) ? toBranchId(branch) : ownBranch(req.user));
  }

  const exists = await User.findOne({ email });
  if (exists) {
    throw ApiError.conflict(`An account with ${email} already exists`, [
      { field: 'email', message: 'This email is already registered' },
    ]);
  }

  const assignedBranch = branchesOn(req) ? toBranchId(branch) : null;
  if (assignedBranch) {
    const branchDoc = await Branch.findById(assignedBranch);
    if (!branchDoc) throw ApiError.badRequest('The selected branch does not exist', [
      { field: 'branch', message: 'Select a valid branch' },
    ]);
  }

  const user = await User.create({
    ...req.body,
    branch: assignedBranch,
    createdBy: req.user._id,
  });

  await user.populate('branch', 'name code');
  return sendCreated(res, { message: `${user.name} can now sign in`, data: shape(user) });
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  assertCanManageUser(req, user);

  const isSelf = String(user._id) === String(req.user._id);

  // Guard rails that stop a super admin locking themselves (or everyone) out.
  if (isSelf && req.body.role && req.body.role !== user.role) {
    throw ApiError.badRequest('You cannot change your own role');
  }
  if (isSelf && req.body.isActive === false) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }
  if (user.role === 'superadmin' && req.body.role && req.body.role !== 'superadmin') {
    const remaining = await User.countDocuments({ role: 'superadmin', isActive: true, _id: { $ne: user._id } });
    if (remaining === 0) throw ApiError.badRequest('At least one active Super Admin must remain');
  }

  if (req.body.email && req.body.email !== user.email) {
    const clash = await User.findOne({ email: req.body.email, _id: { $ne: user._id } });
    if (clash) throw ApiError.conflict('That email is already registered', [
      { field: 'email', message: 'This email is already registered' },
    ]);
  }

  const previousBranch = user.branch;
  const nextRole = req.body.role || user.role;
  const nextBranch =
    req.body.branch !== undefined ? toBranchId(req.body.branch) : previousBranch ? String(previousBranch) : null;

  // A branch Super Admin cannot grant the Super Admin role, and cannot push an
  // account out of their own branch — either would reach past their assignment.
  if (!isGlobalSuperAdmin(req.user)) {
    if (nextRole === 'superadmin') {
      throw ApiError.forbidden('Only the main Super Admin can grant the Super Admin role.');
    }
    assertBranchWrite(req, nextBranch);
  }

  // Losing the last main Super Admin can happen by demotion, by branching one,
  // or by switching one off from the edit form.
  if (
    user.role === 'superadmin' &&
    !previousBranch &&
    (nextRole !== 'superadmin' || nextBranch || req.body.isActive === false)
  ) {
    await assertAnotherMainSuperAdminRemains(user._id);
  }

  Object.assign(user, req.body);
  user.branch = branchesOn(req) ? nextBranch || null : previousBranch;
  await user.save();
  await user.populate('branch', 'name code');

  return sendSuccess(res, { message: `${user.name} updated`, data: shape(user) });
});

export const toggleUserStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('+refreshTokens');
  if (!user) throw ApiError.notFound('User not found');

  assertCanManageUser(req, user);

  if (String(user._id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }
  if (user.role === 'superadmin' && user.isActive) {
    const remaining = await User.countDocuments({ role: 'superadmin', isActive: true, _id: { $ne: user._id } });
    if (remaining === 0) throw ApiError.badRequest('At least one active Super Admin must remain');
    if (!user.branch) await assertAnotherMainSuperAdminRemains(user._id);
  }

  user.isActive = !user.isActive;
  // Deactivating must sign the account out everywhere, immediately.
  if (!user.isActive) user.refreshTokens = [];
  await user.save();
  await user.populate('branch', 'name code');

  return sendSuccess(res, {
    message: `${user.name} has been ${user.isActive ? 'activated' : 'deactivated'}`,
    data: shape(user),
  });
});

export const resetUserPassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('+password +refreshTokens');
  if (!user) throw ApiError.notFound('User not found');

  assertCanManageUser(req, user);

  user.password = req.body.password;
  user.refreshTokens = [];
  await user.save();

  return sendSuccess(res, { message: `Password reset for ${user.name}. They must sign in again.` });
});

export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  assertCanManageUser(req, user);

  if (String(user._id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot delete your own account');
  }
  if (user.role === 'superadmin') {
    const remaining = await User.countDocuments({ role: 'superadmin', _id: { $ne: user._id } });
    if (remaining === 0) throw ApiError.badRequest('At least one Super Admin must remain');
    if (!user.branch) await assertAnotherMainSuperAdminRemains(user._id);
  }

  // Deleting someone who has billed would orphan the ledger — deactivate instead.
  const billed = await Bill.countDocuments({ 'billedBy.id': user._id });
  if (billed > 0) {
    throw ApiError.conflict(
      `${user.name} has created ${billed} bill(s). Deactivate the account instead of deleting it so your bill records stay intact.`
    );
  }

  await user.deleteOne();
  return sendSuccess(res, { message: `${user.name} has been removed` });
});
