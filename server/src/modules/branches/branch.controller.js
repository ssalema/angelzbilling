import Branch from '../../models/Branch.js';
import User from '../../models/User.js';
import Bill from '../../models/Bill.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/ApiResponse.js';
import { getPagination, getSort, escapeRegex } from '../../utils/query.js';
import { assertBranchAccess } from '../../middlewares/authorize.js';
import { uploadBuffer, destroyAsset } from '../../config/cloudinary.js';

const SORTABLE = ['createdAt', 'name', 'code'];

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
    ...b,
    id: b._id,
    // Resolved once here so every picker, table and print header agrees.
    effectiveLogo: b.hasOwnLogo ? b.logo?.url || '' : '',
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

  return sendSuccess(res, {
    message: 'Branch loaded',
    data: { ...branch, id: branch._id, effectiveLogo: branch.hasOwnLogo ? branch.logo?.url || '' : '' },
  });
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
 * A branch logo replaces the store logo everywhere that branch is shown — bill
 * headers, the branch table and a branch admin's sidebar. Uploading one turns
 * `hasOwnLogo` on, so the toggle and the asset can never disagree.
 */
export const uploadBranchLogo = asyncHandler(async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!branch) throw ApiError.notFound('Branch not found');
  if (!req.file) throw ApiError.badRequest('Choose an image to upload');
  if (!req.file.mimetype.startsWith('image/')) throw ApiError.badRequest('A branch logo must be an image file');

  const previous = branch.logo?.publicId;
  const asset = await uploadBuffer(req.file.buffer, { folder: 'branding/branches', resourceType: 'image' });

  branch.logo = { url: asset.url, publicId: asset.publicId };
  branch.hasOwnLogo = true;
  await branch.save();

  if (previous && previous !== asset.publicId) await destroyAsset(previous, 'image');

  return sendSuccess(res, {
    message: `Logo updated for "${branch.name}"`,
    data: { ...branch.toObject(), id: branch._id, effectiveLogo: branch.logo.url },
  });
});

export const removeBranchLogo = asyncHandler(async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!branch) throw ApiError.notFound('Branch not found');

  const publicId = branch.logo?.publicId;
  branch.logo = { url: '', publicId: '' };
  branch.hasOwnLogo = false; // falls back to the store logo
  await branch.save();

  if (publicId) await destroyAsset(publicId, 'image');

  return sendSuccess(res, {
    message: `"${branch.name}" now uses the store logo`,
    data: { ...branch.toObject(), id: branch._id, effectiveLogo: '' },
  });
});
