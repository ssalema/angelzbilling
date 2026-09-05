import User from '../../models/User.js';
import Branch from '../../models/Branch.js';
import Bill from '../../models/Bill.js';
import ApiError from '../../utils/ApiError.js';
import { branchesOn } from '../../utils/featureFlags.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/ApiResponse.js';
import { getPagination, getSort, escapeRegex, round2 } from '../../utils/query.js';

const SORTABLE = ['createdAt', 'name', 'email', 'role', 'lastLoginAt'];

const shape = (user, stats = {}) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone || '',
  phoneCountryCode: user.phoneCountryCode || '+91',
  role: user.role,
  roleLabel: { superadmin: 'Super Admin', admin: 'Branch Admin', staff: 'Billing Staff' }[user.role],
  branch: user.branch ? { id: user.branch._id, name: user.branch.name, code: user.branch.code } : null,
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
  if (branch && branch !== 'all') filter.branch = branch;
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

  const exists = await User.findOne({ email });
  if (exists) {
    throw ApiError.conflict(`An account with ${email} already exists`, [
      { field: 'email', message: 'This email is already registered' },
    ]);
  }

  // With branches switched off there is nothing to pin an account to, so the
  // branch is neither asked for nor required.
  if (role !== 'superadmin' && branchesOn(req)) {
    const branchDoc = await Branch.findById(branch);
    if (!branchDoc) throw ApiError.badRequest('The selected branch does not exist', [
      { field: 'branch', message: 'Select a valid branch' },
    ]);
  }

  const user = await User.create({
    ...req.body,
    branch: role === 'superadmin' || !branchesOn(req) ? null : branch,
    createdBy: req.user._id,
  });

  await user.populate('branch', 'name code');
  return sendCreated(res, { message: `${user.name} can now sign in`, data: shape(user) });
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

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

  const nextRole = req.body.role || user.role;
  Object.assign(user, req.body);
  // With branches off, leave whatever the account already had untouched, so
  // flipping the switch back on restores the old scoping rather than orphaning
  // every account that happened to be edited while it was off.
  if (nextRole === 'superadmin') user.branch = null;
  else if (branchesOn(req)) user.branch = req.body.branch ?? user.branch;
  await user.save();
  await user.populate('branch', 'name code');

  return sendSuccess(res, { message: `${user.name} updated`, data: shape(user) });
});

export const toggleUserStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('+refreshTokens');
  if (!user) throw ApiError.notFound('User not found');

  if (String(user._id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }
  if (user.role === 'superadmin' && user.isActive) {
    const remaining = await User.countDocuments({ role: 'superadmin', isActive: true, _id: { $ne: user._id } });
    if (remaining === 0) throw ApiError.badRequest('At least one active Super Admin must remain');
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

  user.password = req.body.password;
  user.refreshTokens = [];
  await user.save();

  return sendSuccess(res, { message: `Password reset for ${user.name}. They must sign in again.` });
});

export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  if (String(user._id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot delete your own account');
  }
  if (user.role === 'superadmin') {
    const remaining = await User.countDocuments({ role: 'superadmin', _id: { $ne: user._id } });
    if (remaining === 0) throw ApiError.badRequest('At least one Super Admin must remain');
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
