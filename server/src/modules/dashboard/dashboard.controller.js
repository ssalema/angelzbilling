import mongoose from 'mongoose';
import Bill from '../../models/Bill.js';
import Perfume from '../../models/Perfume.js';
import User from '../../models/User.js';
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
import { locationFilter } from '../../utils/locations.js';
import { branchesOn } from '../../utils/featureFlags.js';

/** Every figure on this page is computed here — nothing is hardcoded. */

/**
 * Which bills count towards the shop's figures, and what they are worth.
 *
 * A refund hands the money back, so a refunded bill is worth nothing and is the
 * only status excluded. Everything else earns — but only what was actually
 * collected: a ₹15,000 bill settled with ₹9,450 is ₹9,450 of revenue, and the
 * ₹5,550 balance is outstanding, not income. `EARNING` is the match, `COLLECTED`
 * the money, `BILLED` the face value the two are reconciled against.
 */
const EARNING = { status: { $ne: 'refunded' } };
const COLLECTED = '$amountPaid';
const BILLED = '$grandTotal';
/** Only a pending bill is owed anything; a refund zeroes its balance on the way out. */
const OUTSTANDING = { $cond: [{ $eq: ['$status', 'pending'] }, '$amountDue', 0] };

/**
 * A customer is identified by country code + number together, so +65 91234567
 * and +91 91234567 are two people. Bills written before country codes existed
 * fall back to +91, which is what they were.
 */
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

/* ─────────────────────────── Summary cards ─────────────────────────── */

export const getSummary = asyncHandler(async (req, res) => {
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
        // The face value of what was sold. AOV is an *order* value, so it is
        // measured against this rather than against how much of it has been
        // collected so far — otherwise a slow payer shrinks the basket size.
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
          lowStock: {
            $sum: {
              $cond: [
                {
                  $lte: [
                    // One bulk weight per perfume — variants share it.
                    { $ifNull: ['$stock', 0] },
                    { $ifNull: ['$lowStockThreshold', 100] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    // "Customers" = distinct contact numbers that have ever been billed. The
    // country code is part of the identity: +65 91234567 is not +91 91234567.
    Bill.aggregate([
      { $match: { ...scope, ...EARNING } },
      { $group: { _id: CUSTOMER_KEY, firstSeen: { $min: '$createdAt' } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          newInPeriod: {
            $sum: {
              $cond: [
                window.start
                  ? { $and: [{ $gte: ['$firstSeen', window.start] }, { $lte: ['$firstSeen', window.end] }] }
                  : true,
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    previous
      ? Bill.aggregate([
          { $match: { ...scope, ...buildDateMatch(prior), ...EARNING } },
          { $group: { _id: CUSTOMER_KEY } },
          { $count: 'total' },
        ])
      : Promise.resolve([]),
    User.countDocuments({ isActive: true }),
  ]);

  const cur = currentTotals[0] || { revenue: 0, billed: 0, outstanding: 0, bills: 0, units: 0 };
  const prev = previousTotals[0] || { revenue: 0, billed: 0, outstanding: 0, bills: 0, units: 0 };
  const perfumes = perfumeStats[0] || { total: 0, published: 0, draft: 0, lowStock: 0 };
  const customers = customerRows[0] || { total: 0, newInPeriod: 0 };

  const statusMap = Object.fromEntries(billStatusCounts.map((r) => [r._id, r.count]));

  return sendSuccess(res, {
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
      },
      customers: {
        value: customers.total,
        newInPeriod: customers.newInPeriod,
        growth: growth(customers.total, previousCustomerRows[0]?.total || 0),
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
});

/* ────────────────── Revenue / Bills / Customers / AOV chart ────────────────── */

export const getSeries = asyncHandler(async (req, res) => {
  const scope = branchMatch(req);
  const window = windowFromQuery(req);
  const granularity = pickGranularity(window);
  const metric = req.query.metric || 'revenue';

  const formats = { day: '%Y-%m-%d', month: '%Y-%m', year: '%Y' };

  const rows = await Bill.aggregate([
    { $match: { ...scope, ...buildDateMatch(window), ...EARNING } },
    {
      $group: {
        _id: { $dateToString: { format: formats[granularity], date: '$createdAt' } },
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

  if (window.start && window.end) {
    const cursor = new Date(window.start);
    const stamp = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return granularity === 'day' ? `${y}-${m}-${day}` : granularity === 'month' ? `${y}-${m}` : `${y}`;
    };

    while (cursor <= window.end) {
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

      if (granularity === 'day') cursor.setDate(cursor.getDate() + 1);
      else if (granularity === 'month') cursor.setMonth(cursor.getMonth() + 1);
      else cursor.setFullYear(cursor.getFullYear() + 1);
    }
  } else {
    rows.forEach((r) =>
      filled.push({ key: r._id, date: null, revenue: r.revenue, bills: r.bills, customers: r.customers, aov: r.aov })
    );
  }

  const total = filled.reduce((sum, point) => sum + (point[metric] || 0), 0);

  return sendSuccess(res, {
    message: 'Revenue analytics loaded',
    data: {
      metric,
      granularity,
      points: filled,
      total: metric === 'aov' ? (filled.length ? round2(total / filled.length) : 0) : round2(total),
    },
  });
});

/* ─────────────────────────── Donut / pie charts ─────────────────────────── */

export const getPaymentBreakdown = asyncHandler(async (req, res) => {
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

  return sendSuccess(res, {
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
});

/* ─────────────────────────── Top selling perfumes ─────────────────────────── */

export const getTopPerfumes = asyncHandler(async (req, res) => {
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

  return sendSuccess(res, {
    message: 'Top selling perfumes loaded',
    data: rows.map((r) => ({
      perfumeId: r._id.perfume,
      name: r._id.name,
      image: r.image || '',
      units: r.units,
      revenue: round2(r.revenue),
    })),
  });
});

/* ─────────────────────────── Recent bills & low stock ─────────────────────────── */

export const getRecentBills = asyncHandler(async (req, res) => {
  const limit = Math.min(20, Number.parseInt(req.query.limit, 10) || 5);

  const bills = await Bill.find(branchMatch(req))
    .select('billNumber customer grandTotal status paymentMethod branch billedBy createdAt')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return sendSuccess(res, {
    message: 'Recent bills loaded',
    data: bills.map((b) => ({ ...b, id: b._id })),
  });
});

export const getLowStock = asyncHandler(async (req, res) => {
  const limit = Math.min(50, Number.parseInt(req.query.limit, 10) || 8);

  const rows = await Perfume.aggregate([
    { $match: { status: { $ne: 'archived' } } },
    {
      $addFields: {
        // The perfume's single bulk weight; variants hold no stock of their own.
        totalStock: { $ifNull: ['$stock', 0] },
      },
    },
    { $match: { $expr: { $lte: ['$totalStock', '$lowStockThreshold'] } } },
    { $sort: { totalStock: 1 } },
    { $limit: limit },
    {
      $project: {
        name: 1,
        sku: 1,
        brand: 1,
        totalStock: 1,
        lowStockThreshold: 1,
        status: 1,
        image: { $ifNull: [{ $first: '$images.url' }, ''] },
      },
    },
  ]);

  return sendSuccess(res, {
    message: 'Low stock alerts loaded',
    data: rows.map((r) => ({ ...r, id: r._id, isOutOfStock: r.totalStock === 0 })),
  });
});

/* ─────────────────────────── Branch comparison ─────────────────────────── */

export const getBranchPerformance = asyncHandler(async (req, res) => {
  // Nothing to compare in a single-location store — every bill would land in
  // one "Unassigned" row.
  if (!branchesOn(req)) return sendSuccess(res, { message: 'Branch performance loaded', data: [] });

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

  return sendSuccess(res, {
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
});

/* ─────────────────────────── Bill status donut ─────────────────────────── */

/**
 * How the period's bills settled: fully paid, still owed, or handed back.
 *
 * Counts, not money — the money version of this question is the revenue card and
 * its outstanding figure. A status with nothing in it is left out entirely so a
 * shop that never refunds does not carry a permanent empty slice, but the order
 * is fixed so Paid always wears the same colour from one period to the next.
 */
const BILL_STATUS_SEGMENTS = [
  { key: 'paid', label: 'Paid' },
  { key: 'pending', label: 'Pending' },
  { key: 'refunded', label: 'Refunded' },
];

export const getBillStatusBreakdown = asyncHandler(async (req, res) => {
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

  return sendSuccess(res, {
    message: 'Bill status analytics loaded',
    data: {
      total,
      segments,
      settledPercentage: total ? round2(((byStatus.paid?.count || 0) / total) * 100) : 0,
      outstanding: round2(byStatus.pending?.amount || 0),
    },
  });
});
