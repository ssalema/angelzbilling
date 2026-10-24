import { Router } from 'express';
import { z } from 'zod';
import authenticate from '../../middlewares/authenticate.js';
import { invalidateDashboardOnWrite } from '../../middlewares/cache.js';
import { announceOnWrite } from '../../middlewares/realtime.js';
import validate from '../../middlewares/validate.js';
import { authorize } from '../../middlewares/authorize.js';
import { lookupLimiter } from '../../middlewares/security.js';
import idempotent from '../../middlewares/idempotency.js';
import {
  createBillSchema,
  listBillQuerySchema,
  updateStatusSchema,
  collectPaymentSchema,
  idParamSchema,
  customerLookupQuerySchema,
} from './bill.validation.js';
import {
  listBills,
  getBill,
  createBill,
  previewBill,
  updateBillStatus,
  collectPayment,
  getBillStats,
  lookupCustomers,
} from './bill.controller.js';

const router = Router();
router.use(authenticate);
// Bill writes clear the cached dashboard analytics.
router.use(invalidateDashboardOnWrite({ except: ['/preview'], scoped: true }));
// Notify open screens at that location (bills and perfumes, since bills change stock).
// See middlewares/realtime.js.
router.use(announceOnWrite({ resource: 'bills', scoped: true, except: ['/preview'], also: ['perfumes'] }));

const statsQuery = z.object({
  range: z.enum(['today', 'week', 'month', 'year', 'all', 'custom']).optional().default('month'),
  from: z.string().optional(),
  to: z.string().optional(),
  branch: z.string().optional(),
});

router.get('/', validate({ query: listBillQuerySchema }), listBills);
router.get('/stats', validate({ query: statsQuery }), getBillStats);

router.get(
  '/customers',
  lookupLimiter,
  validate({ query: customerLookupQuerySchema }),
  lookupCustomers
);

// Any signed-in account may raise a bill.
router.post('/preview', validate({ body: createBillSchema.partial({ paymentMethod: true }) }), previewBill);
// Idempotent: a retry returns the first bill instead of creating a second.
router.post('/', idempotent, validate({ body: createBillSchema }), createBill);

router.get('/:id', validate({ params: idParamSchema }), getBill);

router.patch(
  '/:id/payment',
  idempotent,
  validate({ params: idParamSchema, body: collectPaymentSchema }),
  collectPayment
);

// Refunds are admin-only.
router.patch(
  '/:id/status',
  authorize('superadmin', 'admin'),
  idempotent,
  validate({ params: idParamSchema, body: updateStatusSchema }),
  updateBillStatus
);

export default router;
