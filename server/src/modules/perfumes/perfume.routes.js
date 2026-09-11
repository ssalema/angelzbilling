import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.js';
import { invalidateDashboardOnWrite, cacheResponse, catalogueCache } from '../../middlewares/cache.js';
import { announceOnWrite } from '../../middlewares/realtime.js';
import { authorize } from '../../middlewares/authorize.js';
import validate from '../../middlewares/validate.js';
import {
  createPerfumeSchema,
  updatePerfumeSchema,
  listPerfumeQuerySchema,
  lookupQuerySchema,
  statusBodySchema,
  stockBodySchema,
  stockSearchQuerySchema,
  resolveStockNamesSchema,
  bulkStockSchema,
  priceSearchQuerySchema,
  resolvePriceNamesSchema,
  bulkPriceSchema,
  previewBulkCreateSchema,
  bulkCreateSchema,
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
  searchStockTargets,
  resolveStockNames,
  bulkAdjustStock,
  searchPriceTargets,
  resolvePriceNames,
  bulkUpdatePrices,
  previewBulkCreate,
  bulkCreatePerfumes,
  deletePerfume,
} from './perfume.controller.js';

const router = Router();
router.use(authenticate);
router.use(
  invalidateDashboardOnWrite({
    except: ['/stock/resolve', '/price/resolve', '/bulk/preview'],
    // A catalogue write also moves the facet dropdowns cached below — a new
    // brand, a renamed category, a status flip changing the counts.
    catalogue: true,
  })
);
// Stock and prices move while other people are mid-bill, so the catalogue screens
// hear about every write. See middlewares/realtime.js.
router.use(
  announceOnWrite({
    resource: 'perfumes',
    except: ['/stock/resolve', '/price/resolve', '/bulk/preview'],
  })
);

// Read: any signed-in user (billing staff need the catalogue to raise a bill).
router.get('/', validate({ query: listPerfumeQuerySchema }), listPerfumes);
router.get('/facets', cacheResponse({ cache: catalogueCache }), getPerfumeFacets);
router.get('/lookup', validate({ query: lookupQuerySchema }), lookupPerfumes);
// Before /:id, or "next-sku" would be read as an id.
router.get('/next-sku', authorize('superadmin', 'admin'), getNextSku);
// Likewise before /:id — "stock" is a section here, not a perfume.
router.get(
  '/stock/search',
  authorize('superadmin', 'admin'),
  validate({ query: stockSearchQuerySchema }),
  searchStockTargets
);
router.get(
  '/price/search',
  authorize('superadmin', 'admin'),
  validate({ query: priceSearchQuerySchema }),
  searchPriceTargets
);
router.get('/:id', validate({ params: idParamSchema }), getPerfume);

// Write: catalogue management belongs to admins and above.
router.post('/', authorize('superadmin', 'admin'), validate({ body: createPerfumeSchema }), createPerfume);

// Bulk stock top-up.
router.post(
  '/stock/resolve',
  authorize('superadmin', 'admin'),
  validate({ body: resolveStockNamesSchema }),
  resolveStockNames
);
router.post(
  '/stock/bulk',
  authorize('superadmin', 'admin'),
  validate({ body: bulkStockSchema }),
  bulkAdjustStock
);

// Repricing.
router.post(
  '/price/resolve',
  authorize('superadmin', 'admin'),
  validate({ body: resolvePriceNamesSchema }),
  resolvePriceNames
);
router.post(
  '/price/bulk',
  authorize('superadmin', 'admin'),
  validate({ body: bulkPriceSchema }),
  bulkUpdatePrices
);

// Bulk catalogue upload.
router.post(
  '/bulk/preview',
  authorize('superadmin', 'admin'),
  validate({ body: previewBulkCreateSchema }),
  previewBulkCreate
);
router.post(
  '/bulk',
  authorize('superadmin', 'admin'),
  validate({ body: bulkCreateSchema }),
  bulkCreatePerfumes
);

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
