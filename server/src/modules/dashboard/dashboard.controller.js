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

/** Every figure on this page is computed here — nothing is hardcoded. */

// Which bills count towards the shop's figures, and what they are worth.
const EARNING = { status: { $ne: 'refunded' } };
const COLLECTED = '$amountPaid';
const BILLED = '$grandTotal';
/** Only a pending bill is owed anything; a refund zeroes its balance on the way out. */
const OUTSTANDING = { $cond: [{ $eq: ['$status', 'pending'] }, '$amountDue', 0] };

// A customer is identified by country code + number together, so +65 91234567 and +91 91234567 are two people.
const CUSTOMER_KEY = {
  $concat: [{ $ifNull: ['$customer.mobileCountryCode', '+91'] }, '$customer.mobile'],
};

/** Head Office figures are the bills with no branch, so this cannot be a truthy test. */
const branchMatch = (req) => locationFilter(resolveBranchScope(req), 'branch.id');

const windowFromQuery = (req) =>
  resolveDateRange({ range: req.query.range, from: req.query.from, to: req.query.to });

const growth = (current, previous) => {
  if (!previous) return current > 0 ? 100 : 0;
  return round2(((current - previous) / previous) * 100);
};

// Distinct customers ever billed, and how many of them first appeared inside the current window.
const CUSTOMER_COUNT_TTL_MS = 60_000;

/** A resolved scope as the branch value stored on a customer's location entry. */
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

  // Kept in the shape the aggregation returned, so the caller is unchanged.
  const rows = [{ total, newInPeriod }];
  lifetimeCache.set(key, rows, CUSTOMER_COUNT_TTL_MS);
  return rows;
};

/* ─────────────────────────── Summary cards ─────────────────────────── */

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
        // The face value of what was sold.
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
          // Running dry but still sellable — counted apart from the shelves
          // that are already empty, because the card names the two separately.
          lowStock: {
            $sum: {
              $cond: [
                {
                  $and: [
                    // One bulk weight per perfume — variants share it.
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
    // "Customers" = distinct contact numbers that have ever been billed.
    countCustomers(resolveBranchScope(req), window),
    // The same question asked of the window before, so the two figures the card
    // compares are the same measurement. Comparing a lifetime total against one
    // period's customers, as this once did, reads as growth on every load.
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
        // What was raised, and the part of it still to come in. billed =
        // revenue + outstanding, so the card can show both without a second call.
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
        // Everyone ever billed, with the period's new faces beside it.
        value: customers.total,
        newInPeriod: customers.newInPeriod,
        growth: growth(customers.newInPeriod, previousCustomerRows[0]?.newInPeriod || 0),
      },
      averageOrderValue: {
        // Measured on what was billed: the size of a basket does not change
        // because the customer is paying for it in two visits.
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

/* ────────────────── Revenue / Bills / Customers / AOV chart ────────────────── */

/**
 * The server's current UTC offset, as `+05:30`.
 *
 * A fixed offset rather than an Olson name on purpose: Mongo raises on a zone it
 * does not recognise, and an empty chart is a worse failure than an hour's drift
 * in the two weeks a DST region is out of step.
 */
const utcOffset = () => {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  const size = Math.abs(minutes);
  return `${sign}${String(Math.floor(size / 60)).padStart(2, '0')}:${String(size % 60).padStart(2, '0')}`;
};

const TIMEZONE = utcOffset();

/** A runaway custom range must not be able to ask for a million points. */
const MAX_POINTS = 2000;

const computeSeries = async (req) => {
  const scope = branchMatch(req);
  const window = windowFromQuery(req);
  const metric = req.query.metric || 'revenue';

  // "All time" has no bounds of its own, so the trading history supplies them.
  // Without this the range is bucketed by month whatever it holds, and a shop
  // three weeks old draws its whole history as one dot.
  let span = window;
  if (!window.start || !window.end) {
    const [extent] = await Bill.aggregate([
      { $match: { ...scope, ...EARNING } },
      { $group: { _id: null, start: { $min: '$createdAt' }, end: { $max: '$createdAt' } } },
    ]);
    if (extent?.start) span = { start: extent.start, end: extent.end };
  }

  // `range` is left off deliberately: the span decides the bucket size here, and
  // naming the range would send 'all' back down the fixed-month path.
  const granularity = pickGranularity({ start: span.start, end: span.end });

  const formats = { day: '%Y-%m-%d', month: '%Y-%m', year: '%Y' };

  const rows = await Bill.aggregate([
    { $match: { ...scope, ...buildDateMatch(window), ...EARNING } },
    {
      $group: {
        // Bucketed on the same clock the window and the fill loop below use.
        // Left in UTC, an evening bill east of Greenwich lands in the previous
        // day's bucket, whose key the fill loop never produces — so its revenue
        // disappears from the chart while still counting on the summary card.
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
        // Same definition as the summary card: order value, not cash collected.
        aov: { $round: [{ $cond: [{ $gt: ['$bills', 0] }, { $divide: ['$billed', '$bills'] }, 0] }, 2] },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Fill the gaps so the chart draws a continuous line instead of jumping days.
  const filled = [];
  const byKey = Object.fromEntries(rows.map((r) => [r._id, r]));

  const stamp = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return granularity === 'day' ? `${y}-${m}-${day}` : granularity === 'month' ? `${y}-${m}` : `${y}`;
  };

  // The cursor has to sit on the first instant of its bucket before it is
  // stepped: adding a month to the 31st skips the month that has no 31st, which
  // dropped whole buckets out of the middle of the line.
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

  // A key is zero-padded, so comparing two of them as text is comparing dates.
  const keyToDate = (key) => {
    const [y, m = '1', d = '1'] = String(key).split('-');
    return new Date(Number(y), Number(m) - 1, Number(d));
  };

  // The span resolved above, falling back to what the rows themselves cover for
  // an all-time range on a shop that has not billed anything yet.
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

  // Nothing above should be able to drop a bucket that holds bills, but a point
  // silently missing from the line is the kind of wrong that looks right — so
  // anything the walk did not emit is put back rather than lost.
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

/* ─────────────────────────── Donut / pie charts ─────────────────────────── */

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

/* ─────────────────────────── Top selling perfumes ─────────────────────────── */

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

/* ─────────────────────────── Recent bills & low stock ─────────────────────────── */

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
        // The perfume's single bulk weight; variants hold no stock of their own.
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

/* ─────────────────────────── Branch comparison ─────────────────────────── */

const computeBranchPerformance = async (req) => {
  // Nothing to compare in a single-location store — every bill would land in
  // one "Unassigned" row.
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

/* ─────────────────────────── Bill status donut ─────────────────────────── */

// How the period's bills settled: fully paid, still owed, or handed back.
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
        // The slice's worth is what the shop holds against it: cash taken on a
        // paid bill, the balance owed on a pending one, money returned on a refund.
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

/* ─────────────────────────── Route handlers ─────────────────────────── */

const handlerFor = (compute) => asyncHandler(async (req, res) => sendSuccess(res, await compute(req)));

export const getSummary = handlerFor(computeSummary);
export const getSeries = handlerFor(computeSeries);
export const getPaymentBreakdown = handlerFor(computePaymentBreakdown);
export const getTopPerfumes = handlerFor(computeTopPerfumes);
export const getRecentBills = handlerFor(computeRecentBills);
export const getLowStock = handlerFor(computeLowStock);
export const getBranchPerformance = handlerFor(computeBranchPerformance);
export const getBillStatusBreakdown = handlerFor(computeBillStatusBreakdown);

/* ─────────────────────────── Combined first load ─────────────────────────── */

// Every widget on the dashboard, for one range, in a single response.
export const getOverview = asyncHandler(async (req, res) => {
  // The list widgets each want a different row count, but the shared query schema carries only one `limit`.
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
