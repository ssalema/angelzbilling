import { Router } from 'express';
import mongoose from 'mongoose';
import authRoutes from '../modules/auth/auth.routes.js';
import userRoutes from '../modules/users/user.routes.js';
import branchRoutes from '../modules/branches/branch.routes.js';
import perfumeRoutes from '../modules/perfumes/perfume.routes.js';
import billRoutes from '../modules/bills/bill.routes.js';
import dashboardRoutes from '../modules/dashboard/dashboard.routes.js';
import settingsRoutes from '../modules/settings/settings.routes.js';
import uploadRoutes from '../modules/uploads/upload.routes.js';
import geoRoutes from '../modules/geo/geo.routes.js';
import { attachFeatures } from '../utils/featureFlags.js';
import authenticate from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { snapshot } from '../middlewares/metrics.js';
import { dashboardCacheStats, lifetimeCache, catalogueCache, lookupCache } from '../middlewares/cache.js';
import { userCacheStats } from '../utils/userCache.js';
import { socketStats } from '../config/socket.js';

const router = Router();

// Liveness and readiness in one.
const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

router.get('/health', (_req, res) => {
  const healthy = DB_STATES[mongoose.connection.readyState] === 'connected';

  return res.status(healthy ? 200 : 503).json({
    success: healthy,
    message: healthy ? 'Server is Working' : 'The database is not reachable',
    data: { status: healthy ? 'ok' : 'degraded', timestamp: new Date().toISOString() },
  });
});

router.get('/metrics', authenticate, authorize('superadmin'), (_req, res) =>
  res.json({
    success: true,
    message: 'Metrics collected',
    data: snapshot({
      caches: {
        dashboard: dashboardCacheStats(),
        lifetime: lifetimeCache.stats,
        catalogue: catalogueCache.stats,
        lookup: lookupCache.stats,
        account: userCacheStats(),
      },
      // This worker's live connections; under the cluster each reports its share.
      realtime: socketStats(),
    }),
  })
);

// Every route below may need to know whether branches are switched on, and the
// scoping helpers that ask are synchronous — so the flag is resolved up front.
router.use(attachFeatures);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/branches', branchRoutes);
router.use('/perfumes', perfumeRoutes);
router.use('/bills', billRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/settings', settingsRoutes);
router.use('/uploads', uploadRoutes);
router.use('/geo', geoRoutes);

export default router;
