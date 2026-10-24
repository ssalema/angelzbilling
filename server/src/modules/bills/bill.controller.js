import mongoose from 'mongoose';
import Bill from '../../models/Bill.js';
import Perfume from '../../models/Perfume.js';
import Customer from '../../models/Customer.js';
import Settings, { DEFAULT_BILL_PREFIX, DEFAULT_MAX_DISCOUNT_PERCENT } from '../../models/Settings.js';
import { moneyFormatter } from '../../utils/money.js';
import Branch from '../../models/Branch.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import logger from '../../config/logger.js';
import { sendSuccess, sendCreated } from '../../utils/ApiResponse.js';
import { getPagination, getSort, escapeRegex, resolveDateRange, buildDateMatch, round2 } from '../../utils/query.js';
import { resolveBranchScope, assertBranchAccess, assertBranchWrite } from '../../middlewares/authorize.js';
import { locationFilter } from '../../utils/locations.js';
import { branchesOn } from '../../utils/featureFlags.js';
import {
  generateBillNumber,
  buildBillItems,
  calculateTotals,
  resolveBillBranch,
  deductStock,
} from './bill.service.js';

const SORTABLE = ['createdAt', 'billNumber', 'grandTotal', 'status', 'amountDue'];

const actor = (req) => ({ id: req.user._id, name: req.user.name, email: req.user.email });

// Transactions need a replica set; fall back when there isn't one.
const noTransactionSupport = (error) =>
  /Transaction numbers are only allowed|replica set|Illegal state transition/i.test(error?.message || '');

const atomically = async (work, fallback) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (!noTransactionSupport(error)) throw error;
    return fallback();
  } finally {
    await session.endSession();
  }
};

const splitPayment = (grandTotal, requested) => {
  const total = round2(grandTotal);
  const paid = requested === undefined ? total : Math.min(round2(requested), total);
  return { amountPaid: paid, amountDue: round2(total - paid), status: paid >= total ? 'paid' : 'pending' };
};

// Builds a search filter that can use the database indexes.
const buildBillSearch = (search) => {
  const term = String(search || '').trim();
  if (!term) return {};

  // Mobile numbers are digits-only and indexed; an anchored regex uses the index.
  if (/^\d+$/.test(term)) return { 'customer.mobile': new RegExp(`^${escapeRegex(term)}`) };

  // Bill numbers (e.g. AP260900001) are stored uppercase, so uppercase the term.
  if (/^[A-Za-z]{1,6}\d*$/.test(term)) {
    return { billNumber: new RegExp(`^${escapeRegex(term.toUpperCase())}`) };
  }

  // Name search, but still try the bill number as a prefix.
  const rx = new RegExp(escapeRegex(term), 'i');
  return {
    $or: [{ 'customer.name': rx }, { billNumber: new RegExp(`^${escapeRegex(term.toUpperCase())}`) }],
  };
};

export const listBills = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { search, status, paymentMethod, billedBy, range, from, to, sort } = req.query;

  const filter = {};

  // Branch scoping is enforced on the server and cannot be overridden.
  Object.assign(filter, locationFilter(resolveBranchScope(req), 'branch.id'));

  if (status !== 'all') filter.status = status;
  if (paymentMethod !== 'all') filter.paymentMethod = paymentMethod;
  if (billedBy && billedBy !== 'all') filter['billedBy.id'] = new mongoose.Types.ObjectId(String(billedBy));

  if (search) Object.assign(filter, buildBillSearch(search));

  const window = resolveDateRange({ range, from, to });
  Object.assign(filter, buildDateMatch(window));

  const LIST_FIELDS =
    'billNumber customer.name customer.mobile customer.mobileCountryCode grandTotal amountDue ' +
    'paymentMethod status branch billedBy.name billedBy.id createdAt items.quantity';

  const [items, total, totals] = await Promise.all([
    Bill.find(filter)
      .select(LIST_FIELDS)
      .slice('payments', -1)
      .sort(getSort(sort, SORTABLE))
      .skip(skip)
      .limit(limit)
      .lean(),
    Bill.countDocuments(filter),
    Bill.aggregate([
      // Money actually collected (amountPaid), not the bill value.
      { $match: { ...filter, status: { $ne: 'refunded' } } },
      { $group: { _id: null, amount: { $sum: '$amountPaid' }, due: { $sum: '$amountDue' } } },
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
      // Totals cover the whole filter, not just this page.
      filteredAmount: round2(totals[0]?.amount || 0),
      filteredDue: round2(totals[0]?.due || 0),
    },
  });
});

export const getBill = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id).lean();
  if (!bill) throw ApiError.notFound('Bill not found');

  assertBranchAccess(req, bill.branch?.id);

  const [settings, branch] = await Promise.all([
    Settings.getCached(),
    bill.branch?.id ? Branch.findById(bill.branch.id).lean() : Promise.resolve(null),
  ]);
  const branchLogo = (branch?.hasOwnLogo ? branch.logo?.url : '') || bill.branch?.logo || '';
  // The slip prints the favicon; a branch with its own logo uses its own.
  const branchFavicon = branch?.hasOwnLogo ? branch.favicon?.url || '' : '';

  return sendSuccess(res, {
    message: 'Bill loaded',
    data: {
      ...bill,
      id: bill._id,
      branch: { ...bill.branch, logo: branchLogo },
      store: {
        siteName: settings.siteName,
        tagline: settings.tagline,
        contactEmail: settings.contactEmail,
        contactNumber: settings.contactNumber,
        contactNumberCountryCode: settings.contactNumberCountryCode || '+91',
        companyAddress: settings.companyAddress,
        gstin: settings.gstin,
        favicon: branchFavicon || settings.branding?.favicon?.url || '',
        logo: branchLogo || settings.branding?.logo?.url || '',
        invoiceFooter: settings.billing?.invoiceFooter || '',
        termsAndConditions: settings.billing?.termsAndConditions || '',
        currencySymbol: settings.billing?.currencySymbol || '₹',
        // The slip only shows the bill's location when branches are on.
        features: { branches: settings.features?.branches !== false },
      },
    },
  });
});

// Cached settings are lean (no schema defaults), so fall back to the strict default.
// An unset limit must never mean "unlimited".
const discountLimits = (req, settings) => ({
  maxDiscountPercent: settings.billing?.maxDiscountPercent ?? DEFAULT_MAX_DISCOUNT_PERCENT,
  canOverride: req.user.role === 'superadmin' || req.user.role === 'admin',
  // Lets the error message show the limit in money.
  formatMoney: moneyFormatter(settings),
});

// Always the store's tax rate; any rate sent in the request body is ignored.
const resolveTaxPercent = (_req, settings) => settings.billing?.defaultTaxPercent ?? 0;

/** Totals without saving anything — used by the preview dialog. */
export const previewBill = asyncHandler(async (req, res) => {
  // Runs on every keystroke, so read settings from the cache.
  const settings = await Settings.getCached();
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
  const [branch, settings] = await Promise.all([
    resolveBillBranch(req.user, req.body.branch, { enabled: branchesOn(req) }),
    Settings.getCached(),
  ]);

  const limits = discountLimits(req, settings);
  const { lines, stockOps } = await buildBillItems(req.body.items, limits);
  const totals = calculateTotals(lines, {
    taxPercent: resolveTaxPercent(req, settings),
    extraDiscount: req.body.extraDiscount,
    ...limits,
  });

  const billNumber = await generateBillNumber({ prefix: settings.billing?.billPrefix || DEFAULT_BILL_PREFIX });

  // Paid/pending is decided from the server's own total, never the client's.
  const settlement = splitPayment(totals.grandTotal, req.body.amountPaid);
  const by = actor(req);
  const now = new Date();

  const payload = {
    billNumber,
    customer: req.body.customer,
    items: lines,
    subtotal: totals.subtotal,
    totalDiscount: totals.totalDiscount,
    taxPercent: totals.taxPercent,
    taxAmount: totals.taxAmount,
    grandTotal: totals.grandTotal,
    amountPaid: settlement.amountPaid,
    amountDue: settlement.amountDue,
    // Only record a payment if money was actually taken.
    payments: settlement.amountPaid > 0
      ? [
          {
            amount: settlement.amountPaid,
            method: req.body.paymentMethod,
            at: now,
            by,
            atBilling: true,
            note: 'Payment at billing',
          },
        ]
      : [],
    statusHistory: [{ from: '', to: settlement.status, at: now, by, note: 'Bill created' }],
    paymentMethod: req.body.paymentMethod,
    status: settlement.status,
    // Omitted when branches are off, so the bill reads as single-location.
    ...(branch ? { branch } : {}),
    // Always the signed-in admin, never taken from the request body.
    billedBy: by,
    notes: req.body.notes || '',
  };

  // Stock is deducted before the bill is written, in both paths.
  const bill = await atomically(
    async (session) => {
      await deductStock(stockOps, session);
      const [created] = await Bill.create([payload], { session });
      await Customer.recordBill(created, session);
      return created;
    },
    async () => {
      // No transactions: deduct stock first, restore it below if the bill fails to save.
      await deductStock(stockOps);
      try {
        const created = await Bill.create(payload);
        // Separate write here; a failure is only logged so the bill still stands.
        await Customer.recordBill(created).catch((error) =>
          logger.error(`Customer roll-up failed for ${created.billNumber}: ${error.message}`)
        );
        return created;
      } catch (error) {
        await Perfume.bulkWrite(
          stockOps.map((op) => ({
            updateOne: {
              filter: { _id: op.updateOne.filter._id },
              update: {
                $inc: {
                  stock: op.updateOne.filter.stock.$gte,
                  stockMargin: op.updateOne.filter.stock.$gte,
                },
              },
            },
          }))
        );
        throw error;
      }
    }
  );

  return sendCreated(res, {
    message: `Bill ${bill.billNumber} created`,
    data: { ...bill.toObject(), id: bill._id },
  });
});

export const collectPayment = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id);
  if (!bill) throw ApiError.notFound('Bill not found');

  const formatMoney = moneyFormatter(await Settings.getCached());

  assertBranchWrite(req, bill.branch?.id);

  if (bill.status !== 'pending') {
    throw ApiError.badRequest(
      bill.status === 'refunded'
        ? `Bill ${bill.billNumber} has been refunded — it cannot take another payment.`
        : `Bill ${bill.billNumber} is already fully paid — there is nothing left to collect.`
    );
  }

  const amount = round2(req.body.amount);
  const due = round2(bill.amountDue);

  if (amount > due) {
    throw ApiError.badRequest(
      `Only ${formatMoney(due)} is pending on bill ${bill.billNumber} — you entered ${formatMoney(amount)}.`
    );
  }

  const by = actor(req);
  const at = new Date();
  const method = req.body.method || bill.paymentMethod;

  const EPSILON = 0.005;
  const collected = await Bill.findOneAndUpdate(
    { _id: bill._id, status: 'pending', amountDue: { $gte: amount - EPSILON } },
    {
      $push: { payments: { amount, method, at, by, note: req.body.note || '' } },
      $inc: { amountPaid: amount, amountDue: -amount },
    },
    { new: true }
  );

  if (!collected) {
    // The bill changed since we read it; re-read to report what actually happened.
    const now = await Bill.findById(bill._id).lean();
    if (now?.status === 'refunded') {
      throw ApiError.conflict(
        `Bill ${bill.billNumber} was refunded while you were collecting — no payment was taken.`
      );
    }
    if (now?.status === 'paid') {
      throw ApiError.conflict(
        `Bill ${bill.billNumber} was settled by someone else while you were collecting — nothing was taken.`
      );
    }
    throw ApiError.conflict(
      `Only ${formatMoney(now?.amountDue)} is still pending on bill ${bill.billNumber} — ` +
        `someone else collected against it while you were entering ${formatMoney(amount)}.`
    );
  }

  let settledBill = collected;
  if (collected.amountDue <= EPSILON) {
    settledBill =
      (await Bill.findOneAndUpdate(
        { _id: bill._id, status: 'pending', amountDue: { $lte: EPSILON } },
        {
          $set: { status: 'paid', amountDue: 0, amountPaid: collected.grandTotal },
          $push: {
            statusHistory: { from: 'pending', to: 'paid', at, by, note: 'Balance settled in full' },
          },
        },
        { new: true }
      )) || collected;
  }

  const settled = settledBill.status === 'paid';

  return sendSuccess(res, {
    message: settled
      ? `Bill ${settledBill.billNumber} is now fully paid`
      : `${formatMoney(amount)} recorded — ${formatMoney(settledBill.amountDue)} still due on ${settledBill.billNumber}`,
    data: { ...settledBill.toObject(), id: settledBill._id },
  });
});

export const updateBillStatus = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id);
  if (!bill) throw ApiError.notFound('Bill not found');

  assertBranchWrite(req, bill.branch?.id);

  const { status, reason } = req.body;
  if (bill.status === status) {
    throw ApiError.badRequest(`This bill is already marked as ${status}`);
  }

  // Paid and pending bills both deducted stock, so both can be refunded.
  if (!['paid', 'pending'].includes(bill.status)) {
    throw ApiError.badRequest(
      `Only a paid or pending bill can be refunded — bill ${bill.billNumber} is marked as "${bill.status}".`
    );
  }

  const returned = new Map();
  bill.items.forEach((item) => {
    const grams = Number(item.gramsDeducted) || Number(item.quantity) || 0;
    const key = String(item.perfume);
    returned.set(key, (returned.get(key) || 0) + grams);
  });

  const restock = [...returned.entries()].map(([perfumeId, grams]) => ({
    updateOne: {
      filter: { _id: perfumeId },
      // Margin is restored along with stock (see the Perfume model).
      update: { $inc: { stock: grams, stockMargin: grams } },
    },
  }));

  const at = new Date();
  const by = actor(req);

  // Claiming the status acts as the lock, so a bill is refunded only once.
  const claim = () =>
    Bill.findOneAndUpdate(
      { _id: bill._id, status: { $in: ['paid', 'pending'] } },
      {
        $set: {
          status,
          refundedAt: at,
          refundReason: reason || '',
          amountDue: 0,
        },
        $push: { statusHistory: { from: bill.status, to: status, at, by, note: reason || '' } },
      },
      { new: true }
    );

  const refunded = await atomically(
    async (session) => {
      const claimed = await claim().session(session);
      if (!claimed) return null;
      if (restock.length) await Perfume.bulkWrite(restock, { session });
      return claimed;
    },
    async () => {
      // No transactions: the claim is still atomic, so only one caller restocks.
      const claimed = await claim();
      if (!claimed) return null;
      if (!restock.length) return claimed;
      try {
        await Perfume.bulkWrite(restock);
        return claimed;
      } catch (error) {
        await Bill.updateOne(
          { _id: bill._id },
          {
            $set: { status: bill.status, refundedAt: null, refundReason: '', amountDue: bill.amountDue },
            $pop: { statusHistory: 1 },
          }
        );
        throw error;
      }
    }
  );

  if (refunded) {
    await Customer.reconcile({
      mobile: bill.customer?.mobile,
      mobileCountryCode: bill.customer?.mobileCountryCode || '+91',
    }).catch((error) =>
      logger.error(`Customer reconcile failed for ${bill.billNumber}: ${error.message}`)
    );
  }

  if (!refunded) {
    throw ApiError.conflict(
      `Bill ${bill.billNumber} was already refunded while you were working on it — the stock and the money have been put back once.`
    );
  }

  return sendSuccess(res, {
    message: `Bill ${refunded.billNumber} marked as ${status}`,
    data: { ...refunded.toObject(), id: refunded._id },
  });
});

/** Counts and money for the Bill Records header, for the active filter. */
export const getBillStats = asyncHandler(async (req, res) => {
  const filter = {};
  // Head Office bills have no branch, so use locationFilter, not a truthy check.
  Object.assign(filter, locationFilter(resolveBranchScope(req), 'branch.id'));

  const window = resolveDateRange({ range: req.query.range || 'month', from: req.query.from, to: req.query.to });
  Object.assign(filter, buildDateMatch(window));

  const [rows] = await Bill.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalBills: { $sum: 1 },
        // Money actually taken, excluding refunded bills.
        revenue: { $sum: { $cond: [{ $ne: ['$status', 'refunded'] }, '$amountPaid', 0] } },
        outstanding: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amountDue', 0] } },
        // Face value of non-refunded bills; the gap to revenue is what's outstanding.
        billedAmount: { $sum: { $cond: [{ $ne: ['$status', 'refunded'] }, '$grandTotal', 0] } },
        paidCount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
        pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        refundedCount: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] } },
        // A refund returns what was actually received.
        refundedAmount: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, '$amountPaid', 0] } },
      },
    },
  ]);

  const empty = {
    totalBills: 0,
    revenue: 0,
    outstanding: 0,
    billedAmount: 0,
    paidCount: 0,
    pendingCount: 0,
    refundedCount: 0,
    refundedAmount: 0,
  };

  return sendSuccess(res, {
    message: 'Bill statistics loaded',
    data: rows
      ? {
          ...rows,
          revenue: round2(rows.revenue),
          outstanding: round2(rows.outstanding),
          billedAmount: round2(rows.billedAmount),
          refundedAmount: round2(rows.refundedAmount),
        }
      : empty,
  });
});

/** Newest bill wins; a blank field falls back to an older bill. */
const firstFilled = (rows, key) => rows.find((row) => row?.[key])?.[key] || '';

// Customer type-ahead, plus exact recall by mobile number.
export const lookupCustomers = asyncHandler(async (req, res) => {
  const { mobile, mobileCountryCode, q, limit } = req.query;

  const filter = {};
  // Same branch scoping as the bill list.
  Object.assign(filter, locationFilter(resolveBranchScope(req), 'branch.id'));

  const exactRecall = Boolean(mobile);

  if (exactRecall) {
    filter['customer.mobile'] = mobile;
    if (mobileCountryCode) {
      // Older bills have no country code but still belong to this customer.
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
        details: { $push: { $mergeObjects: ['$customer', { createdAt: '$createdAt' }] } },
        lastVisit: { $first: '$createdAt' },
        lastBillNumber: { $first: '$billNumber' },
        visits: { $sum: 1 },
        // Only money actually paid, not what is still owed.
        totalSpent: { $sum: { $cond: [{ $ne: ['$status', 'refunded'] }, '$amountPaid', 0] } },
        totalDue: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amountDue', 0] } },
        pending: {
          $push: {
            $cond: [
              { $eq: ['$status', 'pending'] },
              {
                id: '$_id',
                billNumber: '$billNumber',
                createdAt: '$createdAt',
                grandTotal: '$grandTotal',
                amountPaid: '$amountPaid',
                amountDue: '$amountDue',
              },
              null,
            ],
          },
        },
      },
    },
    {
      $project: {
        details: { $slice: ['$details', 20] },
        // Drop the nulls $push added for non-pending bills.
        pending: {
          $slice: [{ $filter: { input: '$pending', as: 'row', cond: { $ne: ['$$row', null] } } }, 10],
        },
        lastVisit: 1,
        lastBillNumber: 1,
        visits: 1,
        totalSpent: 1,
        totalDue: 1,
      },
    },
    { $sort: { lastVisit: -1 } },
    { $limit: limit },
  ]);

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
          totalDue: round2(group.totalDue),
          // Exact recall only, so the type-ahead never reveals who owes money.
          pendingBills: (group.pending || []).map((row) => ({
            ...row,
            id: String(row.id),
            grandTotal: round2(row.grandTotal),
            amountPaid: round2(row.amountPaid),
            amountDue: round2(row.amountDue),
          })),
          lastBillNumber: group.lastBillNumber,
        }
      : {}),
  }));

  return sendSuccess(res, {
    message: customers.length ? 'Customer records found' : 'No matching customer',
    data: customers,
  });
});
