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

/** The signed-in account, in the shape every audit entry is stamped with. */
const actor = (req) => ({ id: req.user._id, name: req.user.name, email: req.user.email });

// Money and stock have to move together, and only a replica set can promise that.
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

// Splits a grand total into what was taken now and what is still owed.
const splitPayment = (grandTotal, requested) => {
  const total = round2(grandTotal);
  const paid = requested === undefined ? total : Math.min(round2(requested), total);
  return { amountPaid: paid, amountDue: round2(total - paid), status: paid >= total ? 'paid' : 'pending' };
};

// Turns the one search box into a predicate the database can actually seek on.
const buildBillSearch = (search) => {
  const term = String(search || '').trim();
  if (!term) return {};

  // Mobile numbers are stored digits-only and the field is indexed. Anchored
  // and case-sensitive (digits have no case), so this is a real index scan.
  if (/^\d+$/.test(term)) return { 'customer.mobile': new RegExp(`^${escapeRegex(term)}`) };

  // Bill numbers look like AP260900001 and are stored uppercase behind a unique
  // index. Uppercasing the term lets a lowercase search still seek the index.
  if (/^[A-Za-z]{1,6}\d*$/.test(term)) {
    return { billNumber: new RegExp(`^${escapeRegex(term.toUpperCase())}`) };
  }

  // A name, or something with punctuation in it. Still try the bill number as a
  // prefix so a pasted "AP-2609" style term is not lost.
  const rx = new RegExp(escapeRegex(term), 'i');
  return {
    $or: [{ 'customer.name': rx }, { billNumber: new RegExp(`^${escapeRegex(term.toUpperCase())}`) }],
  };
};

export const listBills = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { search, status, paymentMethod, billedBy, range, from, to, sort } = req.query;

  const filter = {};

  // Branch scoping is applied here, on the server, and cannot be overridden.
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
      // Money actually collected across the whole filter — a part-paid bill
      // contributes what was taken, not what it was worth.
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
      // Across everything matching the filter, not just this page.
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
  // The slip is headed by the favicon, so a branch with its own prints under
  // its own mark rather than the store's.
  const branchFavicon = branch?.hasOwnLogo ? branch.favicon?.url || '' : '';

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
        // The slip prints the favicon; the logo stays for anything else reading a bill.
        favicon: branchFavicon || settings.branding?.favicon?.url || '',
        // The branch logo wins when it has one; otherwise the store logo.
        logo: branchLogo || settings.branding?.logo?.url || '',
        invoiceFooter: settings.billing?.invoiceFooter || '',
        termsAndConditions: settings.billing?.termsAndConditions || '',
        currencySymbol: settings.billing?.currencySymbol || '₹',
        // The slip names the location a bill was raised at, and a single-location
        // store has none to name — so the switch has to travel with the bill.
        features: { branches: settings.features?.branches !== false },
      },
    },
  });
});

// The discount ceiling this caller is billing under. The cached settings read is
// lean, so no schema default is applied to it — a document written before this
// field existed reads back undefined, and the fallback here is the only one there
// is. It has to be the strict figure: "unset" must not quietly mean "unlimited".
const discountLimits = (req, settings) => ({
  maxDiscountPercent: settings.billing?.maxDiscountPercent ?? DEFAULT_MAX_DISCOUNT_PERCENT,
  canOverride: req.user.role === 'superadmin' || req.user.role === 'admin',
  // The refusal names the ceiling in money, because the field it is about is money.
  formatMoney: moneyFormatter(settings),
});

// The tax this bill is raised under. It is the store's rate alone — the form
// shows it read-only, so a rate arriving in the request body is ignored.
const resolveTaxPercent = (_req, settings) => settings.billing?.defaultTaxPercent ?? 0;

/** Prices and totals without persisting anything — powers the preview dialog. */
export const previewBill = asyncHandler(async (req, res) => {
  // Read-only, and fired on every keystroke in the billing form — served from
  // the in-process settings cache rather than a database round trip each time.
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
  // Independent of each other, and settings is a cached read — so the pair
  // costs one round trip rather than two.
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

  // Full Paid or Partial Paid is settled here, once, from the total the server itself arrived at.
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
    // A bill can be raised with nothing paid yet, and "no money changed hands"
    // is not a payment — the trail records receipts, not intentions.
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
    // Left off entirely when branches are switched off, so the slip and every
    // report read as a single-location store.
    ...(branch ? { branch } : {}),
    // "Bill By" is always the signed-in admin — never taken from the request body.
    billedBy: by,
    notes: req.body.notes || '',
  };

  // Stock comes off the shelf BEFORE the bill is written, in both paths.
  // The customer roll-up is written with the bill, in the same transaction where there is one.
  const bill = await atomically(
    async (session) => {
      await deductStock(stockOps, session);
      const [created] = await Bill.create([payload], { session });
      await Customer.recordBill(created, session);
      return created;
    },
    async () => {
      // No transactions: stock is deducted first, and rolled back below if the bill fails to save.
      await deductStock(stockOps);
      try {
        const created = await Bill.create(payload);
        // Outside a transaction this is a separate write, so a failure here would leave the count one behind.
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

// Collects the balance on a pending bill — the customer coming back with the rest of the money.
export const collectPayment = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id);
  if (!bill) throw ApiError.notFound('Bill not found');

  const formatMoney = moneyFormatter(await Settings.getCached());

  // Money against a bill is a write, so this is the write guard.
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
    // Something changed between the read and the write. Re-read so the message
    // describes what actually happened rather than what we assumed.
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

  // A refund moves money and stock, so this is the write guard, not the read one.
  assertBranchWrite(req, bill.branch?.id);

  const { status, reason } = req.body;
  if (bill.status === status) {
    throw ApiError.badRequest(`This bill is already marked as ${status}`);
  }

  // Paid and pending bills both took weight off the shelf, so both have stock to give back.
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
      // The margin follows the weight back onto the shelf — see the Perfume model.
      update: { $inc: { stock: grams, stockMargin: grams } },
    },
  }));

  const at = new Date();
  const by = actor(req);

  // Claiming the status IS the lock on the refund.
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
      // No transactions: the claim is still an atomic mutex, so at most one caller restocks.
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

/** Header strip on the Bill Records page: counts and money for the active filter. */
export const getBillStats = asyncHandler(async (req, res) => {
  const filter = {};
  // Head Office bills are the ones with no branch, so this has to go through
  // locationFilter rather than a truthy test on the scope.
  Object.assign(filter, locationFilter(resolveBranchScope(req), 'branch.id'));

  const window = resolveDateRange({ range: req.query.range || 'month', from: req.query.from, to: req.query.to });
  Object.assign(filter, buildDateMatch(window));

  const [rows] = await Bill.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalBills: { $sum: 1 },
        // What the shop actually took: `amountPaid` on every bill it still holds the money for.
        revenue: { $sum: { $cond: [{ $ne: ['$status', 'refunded'] }, '$amountPaid', 0] } },
        // …and the other half of that bill, still owed.
        outstanding: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amountDue', 0] } },
        // The face value of everything raised, refunds aside — useful next to
        // revenue, because the gap between them IS the outstanding book.
        billedAmount: { $sum: { $cond: [{ $ne: ['$status', 'refunded'] }, '$grandTotal', 0] } },
        paidCount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
        pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        refundedCount: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] } },
        // A refund hands back what was received, so that is what it is worth.
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

/* ───────────────────────── Customer recall ───────────────────────── */

/** The newest bill wins, but a field left blank on it falls back to an older one. */
const firstFilled = (rows, key) => rows.find((row) => row?.[key])?.[key] || '';

// Type-ahead over past customers so a returning buyer is not re-typed.
export const lookupCustomers = asyncHandler(async (req, res) => {
  const { mobile, mobileCountryCode, q, limit } = req.query;

  const filter = {};
  // Same branch scoping as the bill list — a branch cannot read another's book.
  Object.assign(filter, locationFilter(resolveBranchScope(req), 'branch.id'));

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
        // What this customer has actually handed over, so a part-paid bill does
        // not flatter their history with money they still owe.
        totalSpent: { $sum: { $cond: [{ $ne: ['$status', 'refunded'] }, '$amountPaid', 0] } },
        totalDue: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amountDue', 0] } },
        // The bills this customer still owes on.
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
        // `$push` had to emit a null for every settled bill to keep the $cond total, so strip those.
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
          // Only on an exact recall: the type-ahead must not broadcast who in
          // the branch owes money to anyone guessing at names.
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
