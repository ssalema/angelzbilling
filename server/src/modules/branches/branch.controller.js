import Branch from '../../models/Branch.js';
import User from '../../models/User.js';
import Bill from '../../models/Bill.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/ApiResponse.js';
import { getPagination, getSort, escapeRegex } from '../../utils/query.js';
import { assertBranchAccess, assertBranchWrite, isGlobalSuperAdmin } from '../../middlewares/authorize.js';
import { uploadBuffer, destroyAsset } from '../../config/cloudinary.js';

const SORTABLE = ['createdAt', 'name', 'code'];

/** The two marks a branch can carry, named the way the store names them. */
const BRANDING = { logo: 'Logo', favicon: 'Favicon' };

/** Resolved once, here, so every picker, table and print header agrees. */
const withBranding = (branch) => ({
  ...branch,
  id: branch._id,
  effectiveLogo: branch.hasOwnLogo ? branch.logo?.url || '' : '',
  effectiveFavicon: branch.hasOwnLogo ? branch.favicon?.url || '' : '',
});

export const listBranches = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { search, status, sort } = req.query;

  const filter = {};
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { code: rx }, { 'address.city': rx }];
  }

  // A branch admin only ever needs to see their own branch in pickers. Scoped
  // roles with no branch are refused outright rather than shown every branch.
  if (req.user.role !== 'superadmin') {
    if (!req.user.branch) {
      throw ApiError.forbidden('Your account is not assigned to a branch yet. Contact the super admin.');
    }
    filter._id = req.user.branch._id || req.user.branch;
  }

  const [items, total] = await Promise.all([
    Branch.find(filter).sort(getSort(sort, SORTABLE)).skip(skip).limit(limit).lean(),
    Branch.countDocuments(filter),
  ]);

  // Attach the counts the Settings > Branches table shows.
  const ids = items.map((b) => b._id);
  const [userCounts, billCounts] = await Promise.all([
    User.aggregate([{ $match: { branch: { $in: ids } } }, { $group: { _id: '$branch', count: { $sum: 1 } } }]),
    Bill.aggregate([
      { $match: { 'branch.id': { $in: ids } } },
      { $group: { _id: '$branch.id', count: { $sum: 1 } } },
    ]),
  ]);
  const userMap = Object.fromEntries(userCounts.map((r) => [String(r._id), r.count]));
  const billMap = Object.fromEntries(billCounts.map((r) => [String(r._id), r.count]));

  const enriched = items.map((b) => ({
    ...withBranding(b),
    userCount: userMap[String(b._id)] || 0,
    billCount: billMap[String(b._id)] || 0,
  }));

  return sendPaginated(res, { message: 'Branches loaded', items: enriched, page, limit, total });
});

export const getBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findById(req.params.id).lean();
  if (!branch) throw ApiError.notFound('Branch not found');

  // The list endpoint already pins a scoped role to their own branch; without
  // this, reading one by id walked straight past that and exposed every other
  // branch's address, phone and GSTIN.
  assertBranchAccess(req, branch._id);

  return sendSuccess(res, { message: 'Branch loaded', data: withBranding(branch) });
});

export const createBranch = asyncHandler(async (req, res) => {
  const exists = await Branch.findOne({ code: req.body.code });
  if (exists) throw ApiError.conflict(`Branch code "${req.body.code}" is already in use`, [
    { field: 'code', message: 'This code is already taken' },
  ]);

  const branch = await Branch.create(req.body);
  return sendCreated(res, { message: `Branch "${branch.name}" created`, data: branch });
});

export const updateBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!branch) throw ApiError.notFound('Branch not found');

  // Reading every branch is fine for any Super Admin; editing one is not.
  assertBranchWrite(req, branch._id);

  // Activation is store-wide, and the edit form carries an isActive switch —
  // without this, a branch Super Admin could close their own location through
  // the form after being refused at the status route.
  if (
    !isGlobalSuperAdmin(req.user) &&
    req.body.isActive !== undefined &&
    req.body.isActive !== branch.isActive
  ) {
    throw ApiError.forbidden('Only the main Super Admin can activate or deactivate a location.');
  }

  if (req.body.code && req.body.code !== branch.code) {
    const clash = await Branch.findOne({ code: req.body.code, _id: { $ne: branch._id } });
    if (clash) throw ApiError.conflict(`Branch code "${req.body.code}" is already in use`, [
      { field: 'code', message: 'This code is already taken' },
    ]);
  }

  Object.assign(branch, req.body);
  await branch.save();

  return sendSuccess(res, { message: `Branch "${branch.name}" updated`, data: branch });
});

export const deleteBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!branch) throw ApiError.notFound('Branch not found');

  // Deleting a branch that owns history would orphan users and break reports —
  // deactivate instead, which is what the UI offers.
  const [users, bills] = await Promise.all([
    User.countDocuments({ branch: branch._id }),
    Bill.countDocuments({ 'branch.id': branch._id }),
  ]);

  if (users > 0 || bills > 0) {
    throw ApiError.conflict(
      `"${branch.name}" has ${users} user(s) and ${bills} bill(s) linked to it. ` +
        'Deactivate the branch instead of deleting it to keep your records intact.'
    );
  }

  const logoId = branch.logo?.publicId;
  await branch.deleteOne();
  if (logoId) await destroyAsset(logoId, 'image');

  return sendSuccess(res, { message: `Branch "${branch.name}" deleted` });
});

export const toggleBranchStatus = asyncHandler(async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!branch) throw ApiError.notFound('Branch not found');

  branch.isActive = !branch.isActive;
  // A hand-made status change owns the branch from here on: switching branch
  // management back on must not undo it.
  branch.deactivatedByFeature = false;
  await branch.save();

  return sendSuccess(res, {
    message: `Branch "${branch.name}" ${branch.isActive ? 'activated' : 'deactivated'}`,
    data: branch,
  });
});

/**
 * A branch's own branding replaces the store's everywhere that branch is shown:
 * the logo heads its bills and its admins' sidebar, the favicon is the mark on
 * the printed slip and in the branch table. Uploading either turns
 * `hasOwnLogo` on, so the toggle and the artwork can never disagree.
 */
export const uploadBranchBranding = asyncHandler(async (req, res) => {
  const kind = req.params.kind; // 'logo' | 'favicon'
  const branch = await Branch.findById(req.params.id);
  if (!branch) throw ApiError.notFound('Branch not found');
  assertBranchWrite(req, branch._id);
  if (!req.file) throw ApiError.badRequest('Choose an image to upload');
  if (!req.file.mimetype.startsWith('image/')) {
    throw ApiError.badRequest(`A branch ${kind} must be an image file`);
  }

  const previous = branch[kind]?.publicId;
  const asset = await uploadBuffer(req.file.buffer, { folder: 'branding/branches', resourceType: 'image' });

  branch[kind] = { url: asset.url, publicId: asset.publicId };
  branch.hasOwnLogo = true;
  await branch.save();

  if (previous && previous !== asset.publicId) await destroyAsset(previous, 'image');

  return sendSuccess(res, {
    message: `${BRANDING[kind]} updated for "${branch.name}"`,
    data: withBranding(branch.toObject()),
  });
});

export const removeBranchBranding = asyncHandler(async (req, res) => {
  const kind = req.params.kind;
  const branch = await Branch.findById(req.params.id);
  if (!branch) throw ApiError.notFound('Branch not found');
  assertBranchWrite(req, branch._id);

  const publicId = branch[kind]?.publicId;
  branch[kind] = { url: '', publicId: '' };

  // The switch only goes off once there is no artwork left to switch on: losing
  // the favicon should not quietly drop the logo back to the store's as well.
  const other = kind === 'logo' ? 'favicon' : 'logo';
  if (!branch[other]?.url) branch.hasOwnLogo = false;
  await branch.save();

  if (publicId) await destroyAsset(publicId, 'image');

  return sendSuccess(res, {
    message: branch.hasOwnLogo
      ? `${BRANDING[kind]} removed for "${branch.name}"`
      : `"${branch.name}" now uses the store branding`,
    data: withBranding(branch.toObject()),
  });
});
