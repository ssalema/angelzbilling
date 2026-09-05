import { Router } from 'express';
import { z } from 'zod';
import authenticate from '../../middlewares/authenticate.js';
import { invalidateDashboardOnWrite } from '../../middlewares/cache.js';
import validate from '../../middlewares/validate.js';
import { authorize } from '../../middlewares/authorize.js';
import {
  createBillSchema,
  listBillQuerySchema,
  updateStatusSchema,
  idParamSchema,
  customerLookupQuerySchema,
} from './bill.validation.js';
import {
  listBills,
  getBill,
  createBill,
  previewBill,
  updateBillStatus,
  getBillStats,
  lookupCustomers,
} from './bill.controller.js';

const router = Router();
router.use(authenticate);
// Bills, stock and staff counts all feed dashboard figures — any write here
// makes the cached analytics wrong, so it drops them.
router.use(invalidateDashboardOnWrite({ except: ['/preview'] }));

const statsQuery = z.object({
  range: z.enum(['today', 'week', 'month', 'year', 'all', 'custom']).optional().default('month'),
  from: z.string().optional(),
  to: z.string().optional(),
  branch: z.string().optional(),
});

router.get('/', validate({ query: listBillQuerySchema }), listBills);
router.get('/stats', validate({ query: statsQuery }), getBillStats);

// Recalls a returning customer from their past bills, so the biller types the
// number once instead of the whole form again. Must stay above '/:id'.
router.get('/customers', validate({ query: customerLookupQuerySchema }), lookupCustomers);

// Any signed-in account may raise a bill — that is the billing staff's whole job.
router.post('/preview', validate({ body: createBillSchema.partial({ paymentMethod: true }) }), previewBill);
router.post('/', validate({ body: createBillSchema }), createBill);

router.get('/:id', validate({ params: idParamSchema }), getBill);

// Refunding moves money and stock — admins only.
router.patch(
  '/:id/status',
  authorize('superadmin', 'admin'),
  validate({ params: idParamSchema, body: updateStatusSchema }),
  updateBillStatus
);

export default router;
