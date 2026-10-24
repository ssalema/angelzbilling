import mongoose from 'mongoose';

import Bill from '../../models/Bill.js';
import Perfume from '../../models/Perfume.js';
import User from '../../models/User.js';
import Customer from '../../models/Customer.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import {
  resolveDateRange,
  previousPeriod,
  buildDateMatch,
  pickGranularity,
  round2,
} from '../../utils/query.js';
import { resolveBranchScope } from '../../middlewares/authorize.js';
import { lifetimeCache } from '../../middlewares/cache.js';
import { locationFilter, HEAD_OFFICE_ID } from '../../utils/locations.js';
import { branchesOn } from '../../utils/featureFlags.js';

// Refunded bills don't count towards the shop's figures.
const EARNING = { status: { $ne: 'refunded' } };
const COLLECTED = '$amountPaid';
const BILLED = '$grandTotal';
// Only a pending bill is owed anything; a refund zeroes its balance.
const OUTSTANDING = { $cond: [{ $eq: ['$status', 'pending'] }, '$amountDue', 0] };

// Country code + number together identify a customer.
const CUSTOMER_KEY = {
  $concat: [{ $ifNull: ['$customer.mobileCountryCode', '+91'] }, '$customer.mobile'],
};

// Head Office bills have no branch, so this can't be a truthy test.
const branchMatch = (req) => locationFilter(resolveBranchScope(req), 'branch.id');

const windowFromQuery = (req) =>
  resolveDateRange({ range: req.query.range, from: req.query.from, to: req.query.to });

const growth = (current, previous) => {
  if (!previous) return current > 0 ? 100 : 0;
  return round2(((current - previous) / previous) * 100);
};

const CUSTOMER_COUNT_TTL_MS = 60_000;

// Maps a branch scope to the value stored on a customer's location entry.
const customerBranchValue = (scope) => {
  if (scope === null || scope === undefined) return undefined; // every location
  if (String(scope) === HEAD_OFFICE_ID) return null; // the main business itself
  return new mongoose.Types.ObjectId(String(scope));
};

const countCustomers = async (scope, window) => {
  const key = `customers :: ${scope ?? 'all'} :: ${window.start?.getTime() || 'x'}-${window.end?.getTime() || 'x'}`;

  const cached = lifetimeCache.get(key);
  if (cached) return cached;

  const branch = customerBranchValue(scope);
  const storeWide = branch === undefined;

  const totalFilter = storeWide ? {} : { 'branches.branch': branch };

  let newFilter = null;
  if (window.start) {
    const between = { $gte: window.start, $lte: window.end };
    newFilter = storeWide
      ? { firstSeenAt: between }
      : { branches: { $elemMatch: { branch, firstSeenAt: between } } };
  }

  const [total, newInPeriod] = await Promise.all([
    Customer.countDocuments(totalFilter),
    newFilter ? Customer.countDocuments(newFilter) : Customer.countDocuments(totalFilter),
  ]);

  // Same shape the old aggregation returned.
  const rows = [{ total, newInPeriod }];
  lifetimeCache.set(key, rows, CUSTOMER_COUNT_TTL_MS);
  return rows;
};

const computeSummary = async (req) => {
  const scope = branchMatch(req);
  const window = windowFromQuery(req);
  const prior = previousPeriod(window);

  const current = { ...scope, ...buildDateMatch(window) };
  const previous = prior.start ? { ...scope, ...buildDateMatch(prior) } : null;

  const revenueAgg = (match) => [
    { $match: { ...match, ...EARNING } },
    {
      $group: {
        _id: null,
        revenue: { $sum: COLLECTED },
        billed: { $sum: BILLED },
        outstanding: { $sum: OUTSTANDING },
        bills: { $sum: 1 },
        units: { $sum: { $sum: '$items.quantity' } },
      },
    },
  ];

  const [
    currentTotals,
    previousTotals,
    billStatusCounts,
    perfumeStats,
    customerRows,
    previousCustomerRows,
    staffCount,
  ] = await Promise.all([
    Bill.aggregate(revenueAgg(current)),
    previous ? Bill.aggregate(revenueAgg(previous)) : Promise.resolve([]),
    Bill.aggregate([{ $match: current }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Perfume.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          published: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
          draft: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
          // Low but not empty; out-of-stock is counted separately.
          lowStock: {
            $sum: {
              $cond: [
                {
                  $and: [
                    // One bulk weight per perfume; variants share it.
                    { $gt: [{ $ifNull: ['$stock', 0] }, 0] },
                    { $lte: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$lowStockThreshold', 100] }] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          outOfStock: {
            $sum: { $cond: [{ $lte: [{ $ifNull: ['$stock', 0] }, 0] }, 1, 0] },
          },
        },
      },
    ]),
    countCustomers(resolveBranchScope(req), window),
    // Same measure for the previous window, so growth compares like with like.
    prior.start ? countCustomers(resolveBranchScope(req), prior) : Promise.resolve([]),
    User.countDocuments({ isActive: true }),
  ]);

  const cur = currentTotals[0] || { revenue: 0, billed: 0, outstanding: 0, bills: 0, units: 0 };
  const prev = previousTotals[0] || { revenue: 0, billed: 0, outstanding: 0, bills: 0, units: 0 };
  const perfumes = perfumeStats[0] || { total: 0, published: 0, draft: 0, lowStock: 0, outOfStock: 0 };
  const customers = customerRows[0] || { total: 0, newInPeriod: 0 };

  const statusMap = Object.fromEntries(billStatusCounts.map((r) => [r._id, r.count]));

  return ({
    message: 'Dashboard summary loaded',
    data: {
      range: { ...window, granularity: pickGranularity(window) },
      revenue: {
        // Collected, not billed.
        value: round2(cur.revenue),
        previous: round2(prev.revenue),
        growth: growth(cur.revenue, prev.revenue),
        // billed = revenue + outstanding.
        billed: round2(cur.billed),
        outstanding: round2(cur.outstanding),
      },
      bills: {
        value: cur.bills,
        previous: prev.bills,
        growth: growth(cur.bills, prev.bills),
        paid: statusMap.paid || 0,
        pending: statusMap.pending || 0,
        refunded: statusMap.refunded || 0,
      },
      perfumes: {
        value: perfumes.total,
        published: perfumes.published,
        draft: perfumes.draft,
        lowStock: perfumes.lowStock,
        outOfStock: perfumes.outOfStock,
      },
      customers: {
        value: customers.total,
        newInPeriod: customers.newInPeriod,
        growth: growth(customers.newInPeriod, previousCustomerRows[0]?.newInPeriod || 0),
      },
      averageOrderValue: {
        // Based on billed total, not cash collected.
        value: cur.bills ? round2(cur.billed / cur.bills) : 0,
        previous: prev.bills ? round2(prev.billed / prev.bills) : 0,
        growth: growth(
          cur.bills ? cur.billed / cur.bills : 0,
          prev.bills ? prev.billed / prev.bills : 0
        ),
      },
      unitsSold: cur.units || 0,
      activeUsers: staffCount,
    },
  });
};

// Server's UTC offset as `+05:30`. A fixed offset, not a zone name, because
// Mongo throws on zone names it doesn't recognise.
const utcOffset = () => {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  const size = Math.abs(minutes);
  return `${sign}${String(Math.floor(size / 60)).padStart(2, '0')}:${String(size % 60).padStart(2, '0')}`;
};

const TIMEZONE = utcOffset();

// Caps chart points for very long custom ranges.
const MAX_POINTS = 2000;

const computeSeries = async (req) => {
  const scope = branchMatch(req);
  const window = windowFromQuery(req);
  const metric = req.query.metric || 'revenue';

  // "All time" has no bounds, so use the first and last bill dates.
  let span = window;
  if (!window.start || !window.end) {
    const [extent] = await Bill.aggregate([
      { $match: { ...scope, ...EARNING } },
      { $group: { _id: null, start: { $min: '$createdAt' }, end: { $max: '$createdAt' } } },
    ]);
    if (extent?.start) span = { start: extent.start, end: extent.end };
  }

  // `range` is left out on purpose so the span decides the bucket size.
  const granularity = pickGranularity({ start: span.start, end: span.end });

  const formats = { day: '%Y-%m-%d', month: '%Y-%m', year: '%Y' };

  const rows = await Bill.aggregate([
    { $match: { ...scope, ...buildDateMatch(window), ...EARNING } },
    {
      $group: {
        // Use local time, or late bills land in the wrong day's bucket.
        _id: { $dateToString: { format: formats[granularity], date: '$createdAt', timezone: TIMEZONE } },
        revenue: { $sum: COLLECTED },
        billed: { $sum: BILLED },
        bills: { $sum: 1 },
        customers: { $addToSet: CUSTOMER_KEY },
      },
    },
    {
      $project: {
        _id: 1,
        revenue: { $round: ['$revenue', 2] },
        bills: 1,
        customers: { $size: '$customers' },
        // Order value, not cash collected (same as the summary card).
        aov: { $round: [{ $cond: [{ $gt: ['$bills', 0] }, { $divide: ['$billed', '$bills'] }, 0] }, 2] },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Fill empty buckets so the chart line is continuous.
  const filled = [];
  const byKey = Object.fromEntries(rows.map((r) => [r._id, r]));

  const stamp = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return granularity === 'day' ? `${y}-${m}-${day}` : granularity === 'month' ? `${y}-${m}` : `${y}`;
  };

  // Start at the bucket's first day; adding a month to the 31st can skip a month.
  const startOfBucket = (d) => {
    const at = new Date(d);
    at.setHours(0, 0, 0, 0);
    if (granularity !== 'day') at.setDate(1);
    if (granularity === 'year') at.setMonth(0);
    return at;
  };

  const advance = (d) => {
    if (granularity === 'day') d.setDate(d.getDate() + 1);
    else if (granularity === 'month') d.setMonth(d.getMonth() + 1);
    else d.setFullYear(d.getFullYear() + 1);
  };

  // Keys are zero-padded, so comparing them as text compares dates.
  const keyToDate = (key) => {
    const [y, m = '1', d = '1'] = String(key).split('-');
    return new Date(Number(y), Number(m) - 1, Number(d));
  };

  // Falls back to the rows' own range when the span has no bounds.
  const bounds = (() => {
    if (span.start && span.end) return { start: span.start, end: span.end };
    if (!rows.length) return null;
    return { start: keyToDate(rows[0]._id), end: keyToDate(rows[rows.length - 1]._id) };
  })();

  if (bounds) {
    const cursor = startOfBucket(bounds.start);
    const lastKey = stamp(bounds.end);

    while (stamp(cursor) <= lastKey && filled.length < MAX_POINTS) {
      const key = stamp(cursor);
      const row = byKey[key];
      filled.push({
        key,
        date: new Date(cursor),
        revenue: row?.revenue || 0,
        bills: row?.bills || 0,
        customers: row?.customers || 0,
        aov: row?.aov || 0,
      });

      advance(cursor);
    }
  }

  // Safety net: add back any bucket with bills that the walk above missed.
  const emitted = new Set(filled.map((point) => point.key));
  rows
    .filter((r) => !emitted.has(r._id))
    .forEach((r) =>
      filled.push({
        key: r._id,
        date: keyToDate(r._id),
        revenue: r.revenue,
        bills: r.bills,
        customers: r.customers,
        aov: r.aov,
      })
    );

  filled.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const total = filled.reduce((sum, point) => sum + (point[metric] || 0), 0);

  return ({
    message: 'Revenue analytics loaded',
    data: {
      metric,
      granularity,
      points: filled,
      total: metric === 'aov' ? (filled.length ? round2(total / filled.length) : 0) : round2(total),
    },
  });
};

const computePaymentBreakdown = async (req) => {
  const window = windowFromQuery(req);
  const labels = {
    cash: 'Cash',
    card: 'Card',
    upi: 'UPI',
    bank_transfer: 'Bank Transfer',
  };

  const rows = await Bill.aggregate([
    { $match: { ...branchMatch(req), ...buildDateMatch(window), ...EARNING } },
    { $group: { _id: '$paymentMethod', count: { $sum: 1 }, amount: { $sum: COLLECTED } } },
    { $sort: { count: -1 } },
  ]);

  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return ({
    message: 'Payment analytics loaded',
    data: {
      total,
      segments: rows.map((r) => ({
        key: r._id,
        label: labels[r._id] || r._id,
        count: r.count,
        amount: round2(r.amount),
        percentage: total ? round2((r.count / total) * 100) : 0,
      })),
    },
  });
};

const computeTopPerfumes = async (req) => {
  const window = windowFromQuery(req);
  const limit = Math.min(20, Number.parseInt(req.query.limit, 10) || 5);
  const by = req.query.by === 'revenue' ? 'revenue' : 'units';

  const rows = await Bill.aggregate([
    { $match: { ...branchMatch(req), ...buildDateMatch(window), ...EARNING } },
    { $unwind: '$items' },
    {
      $group: {
        _id: { perfume: '$items.perfume', name: '$items.perfumeName' },
        units: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.lineTotal' },
        image: { $first: '$items.image' },
      },
    },
    { $sort: { [by]: -1 } },
    { $limit: limit },
  ]);

  return ({
    message: 'Top selling perfumes loaded',
    data: rows.map((r) => ({
      perfumeId: r._id.perfume,
      name: r._id.name,
      image: r.image || '',
      units: r.units,
      revenue: round2(r.revenue),
    })),
  });
};

const computeRecentBills = async (req) => {
  const limit = Math.min(20, Number.parseInt(req.query.limit, 10) || 5);

  const bills = await Bill.find(branchMatch(req))
    .select('billNumber customer grandTotal status paymentMethod branch billedBy createdAt')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return ({
    message: 'Recent bills loaded',
    data: bills.map((b) => ({ ...b, id: b._id })),
  });
};

const computeLowStock = async (req) => {
  const limit = Math.min(50, Number.parseInt(req.query.limit, 10) || 8);

  const rows = await Perfume.aggregate([
    { $match: { status: { $ne: 'archived' }, stockMargin: { $lte: 0 } } },
    { $sort: { stock: 1 } },
    { $limit: limit },
    {
      $project: {
        name: 1,
        sku: 1,
        brand: 1,
        // Variants hold no stock of their own.
        totalStock: { $ifNull: ['$stock', 0] },
        lowStockThreshold: 1,
        status: 1,
        image: { $ifNull: [{ $first: '$images.url' }, ''] },
      },
    },
  ]);

  return ({
    message: 'Low stock alerts loaded',
    data: rows.map((r) => ({ ...r, id: r._id, isOutOfStock: r.totalStock === 0 })),
  });
};

const computeBranchPerformance = async (req) => {
  // Nothing to compare in a single-location store.
  if (!branchesOn(req)) return ({ message: 'Branch performance loaded', data: [] });

  const window = windowFromQuery(req);

  const rows = await Bill.aggregate([
    { $match: { ...branchMatch(req), ...buildDateMatch(window), ...EARNING } },
    {
      $group: {
        _id: { id: '$branch.id', name: '$branch.name', code: '$branch.code' },
        revenue: { $sum: COLLECTED },
        outstanding: { $sum: OUTSTANDING },
        bills: { $sum: 1 },
      },
    },
    { $sort: { revenue: -1 } },
  ]);

  return ({
    message: 'Branch performance loaded',
    data: rows.map((r) => ({
      branchId: r._id.id,
      name: r._id.name || 'Unassigned',
      code: r._id.code || 'NA',
      revenue: round2(r.revenue),
      outstanding: round2(r.outstanding),
      bills: r.bills,
      averageOrderValue: r.bills ? round2(r.revenue / r.bills) : 0,
    })),
  });
};

const BILL_STATUS_SEGMENTS = [
  { key: 'paid', label: 'Paid' },
  { key: 'pending', label: 'Pending' },
  { key: 'refunded', label: 'Refunded' },
];

const computeBillStatusBreakdown = async (req) => {
  const window = windowFromQuery(req);

  const rows = await Bill.aggregate([
    { $match: { ...branchMatch(req), ...buildDateMatch(window) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        // Pending: balance owed. Paid/refunded: amount paid.
        amount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amountDue', '$amountPaid'] } },
      },
    },
  ]);

  const byStatus = Object.fromEntries(rows.map((r) => [r._id, r]));
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  const segments = BILL_STATUS_SEGMENTS.filter((s) => byStatus[s.key]?.count).map((s) => ({
    key: s.key,
    label: s.label,
    count: byStatus[s.key].count,
    amount: round2(byStatus[s.key].amount),
    percentage: total ? round2((byStatus[s.key].count / total) * 100) : 0,
  }));

  return ({
    message: 'Bill status analytics loaded',
    data: {
      total,
      segments,
      settledPercentage: total ? round2(((byStatus.paid?.count || 0) / total) * 100) : 0,
      outstanding: round2(byStatus.pending?.amount || 0),
    },
  });
};

const handlerFor = (compute) => asyncHandler(async (req, res) => sendSuccess(res, await compute(req)));

export const getSummary = handlerFor(computeSummary);
export const getSeries = handlerFor(computeSeries);
export const getPaymentBreakdown = handlerFor(computePaymentBreakdown);
export const getTopPerfumes = handlerFor(computeTopPerfumes);
export const getRecentBills = handlerFor(computeRecentBills);
export const getLowStock = handlerFor(computeLowStock);
export const getBranchPerformance = handlerFor(computeBranchPerformance);
export const getBillStatusBreakdown = handlerFor(computeBillStatusBreakdown);

// All dashboard widgets for one range in a single response.
export const getOverview = asyncHandler(async (req, res) => {
  // Each list widget needs its own `limit`.
  const withLimit = (limit) => ({
    user: req.user,
    body: req.body,
    features: req.features,
    query: { ...req.query, limit },
  });

  const [summary, series, billStatus, payments, topPerfumes, recentBills, lowStock, branchPerformance] =
    await Promise.all([
      computeSummary(req),
      computeSeries(req),
      computeBillStatusBreakdown(req),
      computePaymentBreakdown(req),
      computeTopPerfumes(withLimit(5)),
      computeRecentBills(withLimit(5)),
      computeLowStock(withLimit(6)),
      computeBranchPerformance(req),
    ]);

  return sendSuccess(res, {
    message: 'Dashboard loaded',
    data: {
      summary: summary.data,
      series: series.data,
      billStatus: billStatus.data,
      payments: payments.data,
      topPerfumes: topPerfumes.data,
      recentBills: recentBills.data,
      lowStock: lowStock.data,
      branchPerformance: branchPerformance.data,
    },
  });
});
