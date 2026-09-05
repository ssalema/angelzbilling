import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.js';
import { invalidateDashboardOnWrite } from '../../middlewares/cache.js';
import { authorize } from '../../middlewares/authorize.js';
import validate from '../../middlewares/validate.js';
import {
  createPerfumeSchema,
  updatePerfumeSchema,
  listPerfumeQuerySchema,
  lookupQuerySchema,
  statusBodySchema,
  stockBodySchema,
  idParamSchema,
} from './perfume.validation.js';
import {
  listPerfumes,
  getPerfume,
  getPerfumeFacets,
  lookupPerfumes,
  createPerfume,
  getNextSku,
  updatePerfume,
  updatePerfumeStatus,
  adjustStock,
  deletePerfume,
} from './perfume.controller.js';

const router = Router();
router.use(authenticate);
// Bills, stock and staff counts all feed dashboard figures — any write here
// makes the cached analytics wrong, so it drops them.
router.use(invalidateDashboardOnWrite());

// Read: any signed-in user (billing staff need the catalogue to raise a bill).
router.get('/', validate({ query: listPerfumeQuerySchema }), listPerfumes);
router.get('/facets', getPerfumeFacets);
router.get('/lookup', validate({ query: lookupQuerySchema }), lookupPerfumes);
// Before /:id, or "next-sku" would be read as an id.
router.get('/next-sku', authorize('superadmin', 'admin'), getNextSku);
router.get('/:id', validate({ params: idParamSchema }), getPerfume);

// Write: catalogue management belongs to admins and above.
router.post('/', authorize('superadmin', 'admin'), validate({ body: createPerfumeSchema }), createPerfume);
router.patch(
  '/:id',
  authorize('superadmin', 'admin'),
  validate({ params: idParamSchema, body: updatePerfumeSchema }),
  updatePerfume
);
router.patch(
  '/:id/status',
  authorize('superadmin', 'admin'),
  validate({ params: idParamSchema, body: statusBodySchema }),
  updatePerfumeStatus
);
router.patch(
  '/:id/stock',
  authorize('superadmin', 'admin'),
  validate({ params: idParamSchema, body: stockBodySchema }),
  adjustStock
);
router.delete('/:id', authorize('superadmin', 'admin'), validate({ params: idParamSchema }), deletePerfume);

export default router;
