import mongoose from 'mongoose';
import Bill from '../../models/Bill.js';
import Perfume from '../../models/Perfume.js';
import Settings from '../../models/Settings.js';
import Branch from '../../models/Branch.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../../utils/ApiResponse.js';
import { getPagination, getSort, escapeRegex, resolveDateRange, buildDateMatch, round2 } from '../../utils/query.js';
import { resolveBranchScope, assertBranchAccess } from '../../middlewares/authorize.js';
import {
  generateBillNumber,
  buildBillItems,
  calculateTotals,
  resolveBillBranch,
} from './bill.service.js';

const SORTABLE = ['createdAt', 'billNumber', 'grandTotal', 'status'];

export const listBills = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { search, status, paymentMethod, billedBy, range, from, to, sort } = req.query;

  const filter = {};

  // Branch scoping is applied here, on the server, and cannot be overridden.
  const branchScope = resolveBranchScope(req);
  if (branchScope) filter['branch.id'] = new mongoose.Types.ObjectId(String(branchScope));

  if (status !== 'all') filter.status = status;
  if (paymentMethod !== 'all') filter.paymentMethod = paymentMethod;
  if (billedBy && billedBy !== 'all') filter['billedBy.id'] = new mongoose.Types.ObjectId(String(billedBy));

  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ billNumber: rx }, { 'customer.name': rx }, { 'customer.mobile': rx }];
  }

  const window = resolveDateRange({ range, from, to });
  Object.assign(filter, buildDateMatch(window));

  const [items, total, totals] = await Promise.all([
    Bill.find(filter).sort(getSort(sort, SORTABLE)).skip(skip).limit(limit).lean(),
    Bill.countDocuments(filter),
    Bill.aggregate([
      { $match: { ...filter, status: 'paid' } },
      { $group: { _id: null, amount: { $sum: '$grandTotal' } } },
    ]),
  ]);

  return sendSuccess(res, {
    message: 'Bill records loaded',
    data: items.map((b) => ({ ...b, id: b._id })),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
      // Total value of everything matching the filter, not just this page.
      filteredAmount: totals[0]?.amount || 0,
    },
  });
});

export const getBill = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id).lean();
  if (!bill) throw ApiError.notFound('Bill not found');

  assertBranchAccess(req, bill.branch?.id);

  const settings = await Settings.getSingleton();

  // A branch that carries its own logo prints under it. Read it live so a logo
  // swap shows on reprints, falling back to the snapshot taken at billing time.
  const branch = bill.branch?.id ? await Branch.findById(bill.branch.id).lean() : null;
  const branchLogo = (branch?.hasOwnLogo ? branch.logo?.url : '') || bill.branch?.logo || '';

  return sendSuccess(res, {
    message: 'Bill loaded',
    data: {
      ...bill,
      id: bill._id,
      branch: { ...bill.branch, logo: branchLogo },
      // The print view needs the store identity alongside the bill itself.
      store: {
        siteName: settings.siteName,
        tagline: settings.tagline,
        contactEmail: settings.contactEmail,
        contactNumber: settings.contactNumber,
        contactNumberCountryCode: settings.contactNumberCountryCode || '+91',
        companyAddress: settings.companyAddress,
        gstin: settings.gstin,
        // The branch logo wins when it has one; otherwise the store logo.
        logo: branchLogo || settings.branding?.logo?.url || '',
        invoiceFooter: settings.billing?.invoiceFooter || '',
        termsAndConditions: settings.billing?.termsAndConditions || '',
        currencySymbol: settings.billing?.currencySymbol || '₹',
      },
    },
  });
});

/**
 * The discount ceiling this caller is billing under. Staff are held to the store
 * setting; admins and above may authorise more. Preview and save must resolve it
 * the same way, or the preview would quote a total the save then refuses.
 */
const discountLimits = (req, settings) => ({
  maxDiscountPercent: settings.billing?.maxDiscountPercent ?? 100,
  canOverride: req.user.role === 'superadmin' || req.user.role === 'admin',
});

/**
 * The tax this bill is raised under. An omitted `taxPercent` means "whatever the
 * store is configured for"; an explicit one — including 0 — is the biller's own
 * decision and stands. Preview and save share it so they cannot quote different
 * totals for the same basket.
 */
const resolveTaxPercent = (req, settings) =>
  req.body.taxPercent ?? settings.billing?.defaultTaxPercent ?? 0;

/** Prices and totals without persisting anything — powers the preview dialog. */
export const previewBill = asyncHandler(async (req, res) => {
  const settings = await Settings.getSingleton();
  const limits = discountLimits(req, settings);

  const { lines } = await buildBillItems(req.body.items, limits);
  const totals = calculateTotals(lines, {
    taxPercent: resolveTaxPercent(req, settings),
    extraDiscount: req.body.extraDiscount,
    ...limits,
  });

  return sendSuccess(res, {
    message: 'Bill preview calculated',
    data: { items: lines, ...totals, customer: req.body.customer, paymentMethod: req.body.paymentMethod },
  });
});

export const createBill = asyncHandler(async (req, res) => {
  const branch = await resolveBillBranch(req.user, req.body.branch);
  const settings = await Settings.getSingleton();

  const limits = discountLimits(req, settings);
  const { lines, stockOps } = await buildBillItems(req.body.items, limits);
  const totals = calculateTotals(lines, {
    taxPercent: resolveTaxPercent(req, settings),
    extraDiscount: req.body.extraDiscount,
    ...limits,
  });

  const billNumber = await generateBillNumber({
    prefix: settings.billing?.billPrefix || 'AP',
    branchCode: branch.code,
  });

  const payload = {
    billNumber,
    customer: req.body.customer,
    items: lines,
    subtotal: totals.subtotal,
    totalDiscount: totals.totalDiscount,
    taxPercent: totals.taxPercent,
    taxAmount: totals.taxAmount,
    grandTotal: totals.grandTotal,
    amountPaid: req.body.amountPaid !== undefined ? req.body.amountPaid : totals.grandTotal,
    paymentMethod: req.body.paymentMethod,
    status: 'paid',
    branch,
    // "Bill By" is always the signed-in admin — never taken from the request body.
    billedBy: { id: req.user._id, name: req.user.name, email: req.user.email },
    notes: req.body.notes || '',
  };

  const session = await mongoose.startSession();
  let bill;

  try {
    // A transaction keeps "bill saved" and "stock reduced" atomic on a replica
    // set. Standalone MongoDB has no transactions, so we fall back gracefully.
    await session.withTransaction(async () => {
      const [created] = await Bill.create([payload], { session });
      await Perfume.bulkWrite(stockOps, { session });
      bill = created;
    });
  } catch (error) {
    const noTransactions =
      /Transaction numbers are only allowed|replica set|Illegal state transition/i.test(error.message || '');
    if (!noTransactions) throw error;

    bill = await Bill.create(payload);
    await Perfume.bulkWrite(stockOps);
  } finally {
    await session.endSession();
  }

  return sendCreated(res, {
    message: `Bill ${bill.billNumber} created`,
    data: { ...bill.toObject(), id: bill._id },
  });
});

export const updateBillStatus = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id);
  if (!bill) throw ApiError.notFound('Bill not found');

  assertBranchAccess(req, bill.branch?.id);

  const { status, reason } = req.body;
  if (bill.status === status) {
    throw ApiError.badRequest(`This bill is already marked as ${status}`);
  }

  // Only a paid bill has money and stock to give back. The collection still
  // holds bills written under an older status set ('pending', 'cancelled'),
  // and refunding one of those would put weight back on the shelf that the
  // bill never took off it — inventory that reconciles to nothing.
  if (bill.status !== 'paid') {
    throw ApiError.badRequest(
      `Only a paid bill can be refunded — bill ${bill.billNumber} is marked as "${bill.status}".`
    );
  }

  // Refunding puts the weight back on the shelf — into the perfume's single
  // stock, which is the only place it came from. We replay the grams snapshotted
  // on the line, not today's fill size, so a re-sized catalogue cannot skew
  // stock. Bills written before stock moved to grams carry no snapshot; their
  // quantity was the deduction, so returning it is still exactly what was taken.
  // Lines are summed per perfume so a multi-size refund is one write.
  const returned = new Map();
  bill.items.forEach((item) => {
    const grams = Number(item.gramsDeducted) || Number(item.quantity) || 0;
    const key = String(item.perfume);
    returned.set(key, (returned.get(key) || 0) + grams);
  });

  const restock = [...returned.entries()].map(([perfumeId, grams]) => ({
    updateOne: { filter: { _id: perfumeId }, update: { $inc: { stock: grams } } },
  }));
  if (restock.length) await Perfume.bulkWrite(restock);

  bill.refundedAt = new Date();
  bill.refundReason = reason || '';
  bill.status = status;
  await bill.save();

  return sendSuccess(res, {
    message: `Bill ${bill.billNumber} marked as ${status}`,
    data: { ...bill.toObject(), id: bill._id },
  });
});

/** Header strip on the Bill Records page: counts and money for the active filter. */
export const getBillStats = asyncHandler(async (req, res) => {
  const filter = {};
  const branchScope = resolveBranchScope(req);
  if (branchScope) filter['branch.id'] = new mongoose.Types.ObjectId(String(branchScope));

  const window = resolveDateRange({ range: req.query.range || 'month', from: req.query.from, to: req.query.to });
  Object.assign(filter, buildDateMatch(window));

  const [rows] = await Bill.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalBills: { $sum: 1 },
        revenue: {
          $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$grandTotal', 0] },
        },
        paidCount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
        refundedCount: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] } },
        refundedAmount: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, '$grandTotal', 0] } },
      },
    },
  ]);

  return sendSuccess(res, {
    message: 'Bill statistics loaded',
    data: rows || {
      totalBills: 0,
      revenue: 0,
      paidCount: 0,
      refundedCount: 0,
      refundedAmount: 0,
    },
  });
});

/* ───────────────────────── Customer recall ───────────────────────── */

/** The newest bill wins, but a field left blank on it falls back to an older one. */
const firstFilled = (rows, key) => rows.find((row) => row?.[key])?.[key] || '';

/**
 * Type-ahead over past customers so a returning buyer is not re-typed.
 *
 * There is no Customer collection: a customer is the set of bills raised against
 * their number, so we group the bills by contact number and hand back the most
 * recent identity plus how much business they have done with us.
 */
export const lookupCustomers = asyncHandler(async (req, res) => {
  const { mobile, mobileCountryCode, q, limit } = req.query;

  const filter = {};
  // Same branch scoping as the bill list — a branch cannot read another's book.
  const branchScope = resolveBranchScope(req);
  if (branchScope) filter['branch.id'] = new mongoose.Types.ObjectId(String(branchScope));

  const exactRecall = Boolean(mobile);

  if (exactRecall) {
    // Exact recall: the biller has finished typing the number.
    filter['customer.mobile'] = mobile;
    if (mobileCountryCode) {
      // Bills raised before country codes were stored carry no code at all, and
      // those are still this customer's bills.
      filter.$or = [
        { 'customer.mobileCountryCode': mobileCountryCode },
        { 'customer.mobileCountryCode': { $in: [null, ''] } },
      ];
    }
  } else {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ 'customer.mobile': rx }, { 'customer.name': rx }];
  }

  const groups = await Bill.aggregate([
    { $match: filter },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: { mobile: '$customer.mobile', code: '$customer.mobileCountryCode' },
        // Newest first, capped — a customer's details never need more history.
        details: { $push: { $mergeObjects: ['$customer', { createdAt: '$createdAt' }] } },
        lastVisit: { $first: '$createdAt' },
        lastBillNumber: { $first: '$billNumber' },
        visits: { $sum: 1 },
        totalSpent: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$grandTotal', 0] } },
      },
    },
    { $project: { details: { $slice: ['$details', 20] }, lastVisit: 1, lastBillNumber: 1, visits: 1, totalSpent: 1 } },
    { $sort: { lastVisit: -1 } },
    { $limit: limit },
  ]);

  // Full details only for an exact-number recall: the biller has the customer in
  // front of them and typed their whole number. The `q` type-ahead is a
  // name/number guess, so it returns just enough to pick a row — otherwise
  // walking `q` through the alphabet dumps the branch's whole address book.
  const customers = groups.map((group) => ({
    name: firstFilled(group.details, 'name'),
    mobile: group._id.mobile,
    mobileCountryCode: group._id.code || '+91',
    visits: group.visits,
    lastVisit: group.lastVisit,
    ...(exactRecall
      ? {
          email: firstFilled(group.details, 'email'),
          address: firstFilled(group.details, 'address'),
          gstin: firstFilled(group.details, 'gstin'),
          totalSpent: round2(group.totalSpent),
          lastBillNumber: group.lastBillNumber,
        }
      : {}),
  }));

  return sendSuccess(res, {
    message: customers.length ? 'Customer records found' : 'No matching customer',
    data: customers,
  });
});
