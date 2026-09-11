import { Router } from 'express';
import { z } from 'zod';
import authenticate from '../../middlewares/authenticate.js';
import validate from '../../middlewares/validate.js';
import { cacheResponse } from '../../middlewares/cache.js';
import {
  getSummary,
  getSeries,
  getPaymentBreakdown,
  getBillStatusBreakdown,
  getTopPerfumes,
  getRecentBills,
  getLowStock,
  getBranchPerformance,
  getOverview,
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

const cached = [validate({ query: rangeQuery }), cacheResponse()];

// Every widget for one range in a single response — what the page asks for on load.
router.get('/overview', cached, getOverview);

router.get('/summary', cached, getSummary);
router.get('/revenue-series', cached, getSeries);
router.get('/payment-methods', cached, getPaymentBreakdown);
router.get('/bill-status', cached, getBillStatusBreakdown);
router.get('/top-perfumes', cached, getTopPerfumes);
router.get('/recent-bills', cached, getRecentBills);
router.get('/low-stock', cached, getLowStock);
router.get('/branch-performance', cached, getBranchPerformance);

export default router;
