import { Router } from 'express';
import { z } from 'zod';
import authenticate from '../../middlewares/authenticate.js';
import validate from '../../middlewares/validate.js';
import { cacheResponse } from '../../middlewares/cache.js';
import {
  getSummary,
  getSeries,
  getStatusBreakdown,
  getPaymentBreakdown,
  getTopPerfumes,
  getRecentBills,
  getLowStock,
  getBranchPerformance,
} from './dashboard.controller.js';

/** Every widget shares the same range contract, so one schema covers them all. */
const rangeQuery = z.object({
  range: z.enum(['today', 'week', 'month', 'year', 'all', 'custom']).optional().default('month'),
  from: z.string().optional(),
  to: z.string().optional(),
  branch: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  metric: z.enum(['revenue', 'bills', 'customers', 'aov']).optional(),
  by: z.enum(['units', 'revenue']).optional(),
});

const router = Router();
router.use(authenticate);

/**
 * Every widget here is a read-only aggregation over bills and perfumes, so the
 * page is served from one branch-scoped cache entry per widget and cleared by
 * any write that moves a figure. `cacheResponse` sits after `validate` so the
 * key is built from the normalised query (range already defaulted to 'month')
 * and two requests that mean the same thing hash to the same entry.
 */
const cached = [validate({ query: rangeQuery }), cacheResponse()];

router.get('/summary', cached, getSummary);
router.get('/revenue-series', cached, getSeries);
router.get('/bill-status', cached, getStatusBreakdown);
router.get('/payment-methods', cached, getPaymentBreakdown);
router.get('/top-perfumes', cached, getTopPerfumes);
router.get('/recent-bills', cached, getRecentBills);
router.get('/low-stock', cached, getLowStock);
router.get('/branch-performance', cached, getBranchPerformance);

export default router;
