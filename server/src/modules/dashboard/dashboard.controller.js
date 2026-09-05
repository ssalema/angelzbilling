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

/** Every figure on this page is computed here — nothing is hardcoded. */

const REVENUE_STATUSES = ['paid'];

/**
 * A customer is identified by country code + number together, so +65 91234567
 * and +91 91234567 are two people. Bills written before country codes existed
 * fall back to +91, which is what they were.
 */
const CUSTOMER_KEY = {
  $concat: [{ $ifNull: ['$customer.mobileCountryCode', '+91'] }, '$customer.mobile'],
};

const branchMatch = (req) => {
  const scope = resolveBranchScope(req);
  return scope ? { 'branch.id': new mongoose.Types.ObjectId(String(scope)) } : {};
};

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
    { $match: { ...match, status: { $in: REVENUE_STATUSES } } },
    {
      $group: {
        _id: null,
        revenue: { $sum: '$grandTotal' },
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
      { $match: { ...scope, status: { $in: REVENUE_STATUSES } } },
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
          { $match: { ...scope, ...buildDateMatch(prior), status: { $in: REVENUE_STATUSES } } },
          { $group: { _id: CUSTOMER_KEY } },
          { $count: 'total' },
        ])
      : Promise.resolve([]),
    User.countDocuments({ isActive: true }),
  ]);

  const cur = currentTotals[0] || { revenue: 0, bills: 0, units: 0 };
  const prev = previousTotals[0] || { revenue: 0, bills: 0, units: 0 };
  const perfumes = perfumeStats[0] || { total: 0, published: 0, draft: 0, lowStock: 0 };
  const customers = customerRows[0] || { total: 0, newInPeriod: 0 };

  const statusMap = Object.fromEntries(billStatusCounts.map((r) => [r._id, r.count]));

  return sendSuccess(res, {
    message: 'Dashboard summary loaded',
    data: {
      range: { ...window, granularity: pickGranularity(window) },
      revenue: {
        value: round2(cur.revenue),
        previous: round2(prev.revenue),
        growth: growth(cur.revenue, prev.revenue),
      },
      bills: {
        value: cur.bills,
        previous: prev.bills,
        growth: growth(cur.bills, prev.bills),
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
        value: cur.bills ? round2(cur.revenue / cur.bills) : 0,
        previous: prev.bills ? round2(prev.revenue / prev.bills) : 0,
        growth: growth(
          cur.bills ? cur.revenue / cur.bills : 0,
          prev.bills ? prev.revenue / prev.bills : 0
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
    { $match: { ...scope, ...buildDateMatch(window), status: { $in: REVENUE_STATUSES } } },
    {
      $group: {
        _id: { $dateToString: { format: formats[granularity], date: '$createdAt' } },
        revenue: { $sum: '$grandTotal' },
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
        aov: { $round: [{ $cond: [{ $gt: ['$bills', 0] }, { $divide: ['$revenue', '$bills'] }, 0] }, 2] },
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

export const getStatusBreakdown = asyncHandler(async (req, res) => {
  const window = windowFromQuery(req);

  const rows = await Bill.aggregate([
    { $match: { ...branchMatch(req), ...buildDateMatch(window) } },
    { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$grandTotal' } } },
    { $sort: { count: -1 } },
  ]);

  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return sendSuccess(res, {
    message: 'Bill status analytics loaded',
    data: {
      total,
      segments: rows.map((r) => ({
        key: r._id,
        label: { paid: 'Paid', refunded: 'Refunded' }[r._id] || r._id,
        count: r.count,
        amount: round2(r.amount),
        percentage: total ? round2((r.count / total) * 100) : 0,
      })),
    },
  });
});

export const getPaymentBreakdown = asyncHandler(async (req, res) => {
  const window = windowFromQuery(req);
  const labels = {
    cash: 'Cash',
    card: 'Card',
    upi: 'UPI',
    bank_transfer: 'Bank Transfer',
  };

  const rows = await Bill.aggregate([
    { $match: { ...branchMatch(req), ...buildDateMatch(window), status: { $in: REVENUE_STATUSES } } },
    { $group: { _id: '$paymentMethod', count: { $sum: 1 }, amount: { $sum: '$grandTotal' } } },
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
    { $match: { ...branchMatch(req), ...buildDateMatch(window), status: { $in: REVENUE_STATUSES } } },
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
  const window = windowFromQuery(req);

  const rows = await Bill.aggregate([
    { $match: { ...branchMatch(req), ...buildDateMatch(window), status: { $in: REVENUE_STATUSES } } },
    {
      $group: {
        _id: { id: '$branch.id', name: '$branch.name', code: '$branch.code' },
        revenue: { $sum: '$grandTotal' },
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
      code: r._id.code || '—',
      revenue: round2(r.revenue),
      bills: r.bills,
      averageOrderValue: r.bills ? round2(r.revenue / r.bills) : 0,
    })),
  });
});
