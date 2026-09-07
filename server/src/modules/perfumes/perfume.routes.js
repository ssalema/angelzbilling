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
  stockSearchQuerySchema,
  resolveStockNamesSchema,
  bulkStockSchema,
  priceSearchQuerySchema,
  resolvePriceNamesSchema,
  bulkPriceSchema,
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
  deletePerfume,
} from './perfume.controller.js';

const router = Router();
router.use(authenticate);
// Bills, stock and staff counts all feed dashboard figures — any write here
// makes the cached analytics wrong, so it drops them.
// `/stock/resolve` and `/price/resolve` are exempt: both are lookups that only
// take a POST because they carry a sheet's worth of names in the body, and
// neither changes anything.
router.use(invalidateDashboardOnWrite({ except: ['/stock/resolve', '/price/resolve'] }));

// Read: any signed-in user (billing staff need the catalogue to raise a bill).
router.get('/', validate({ query: listPerfumeQuerySchema }), listPerfumes);
router.get('/facets', getPerfumeFacets);
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

/**
 * Bulk stock top-up. The spreadsheet itself never reaches the server: the
 * browser parses it, the admin reviews the rows, and only the matched names
 * (`/stock/resolve`) and the confirmed grams (`/stock/bulk`) are ever posted.
 */
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

/**
 * Repricing. An admin sends one price per perfume — what a kilo costs — and
 * the ladder in `utils/priceLadder.js` derives every fill size from it here,
 * so a preview the browser drew can never be what actually gets written.
 *
 * A bulk sheet is handled exactly like the stock one: parsed in the browser,
 * matched by name (`/price/resolve`), and applied only once the admin has
 * reviewed it (`/price/bulk`). The file itself never reaches the server.
 */
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
