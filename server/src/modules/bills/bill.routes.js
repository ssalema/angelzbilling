import { Router } from 'express';
import { z } from 'zod';
import authenticate from '../../middlewares/authenticate.js';
import { invalidateDashboardOnWrite } from '../../middlewares/cache.js';
import { announceOnWrite } from '../../middlewares/realtime.js';
import validate from '../../middlewares/validate.js';
import { authorize } from '../../middlewares/authorize.js';
import { lookupLimiter } from '../../middlewares/security.js';
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
// Bills feed dashboard figures — any write here makes the cached analytics wrong, so it drops them.
router.use(invalidateDashboardOnWrite({ except: ['/preview'], scoped: true }));
// And the open panels at that location are told, so a bill raised at one counter
// lands on the other screens without anyone reloading. See middlewares/realtime.js.
router.use(announceOnWrite({ resource: 'bills', scoped: true, except: ['/preview'] }));

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

// Any signed-in account may raise a bill — that is the billing staff's whole job.
router.post('/preview', validate({ body: createBillSchema.partial({ paymentMethod: true }) }), previewBill);
router.post('/', validate({ body: createBillSchema }), createBill);

router.get('/:id', validate({ params: idParamSchema }), getBill);

// Collecting the balance on a pending bill.
router.patch(
  '/:id/payment',
  validate({ params: idParamSchema, body: collectPaymentSchema }),
  collectPayment
);

// Refunding moves money and stock — admins only.
router.patch(
  '/:id/status',
  authorize('superadmin', 'admin'),
  validate({ params: idParamSchema, body: updateStatusSchema }),
  updateBillStatus
);

export default router;
