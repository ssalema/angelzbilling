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

const router = Router();

/**
 * Liveness and readiness in one. A check that only proves Express is up keeps a
 * platform routing traffic at an instance whose database has gone away, so the
 * driver's own connection state is the answer here — and an API that cannot
 * reach Mongo reports 503 rather than a cheerful 200.
 */
const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

router.get('/health', (_req, res) => {
  const database = DB_STATES[mongoose.connection.readyState] || 'unknown';
  const healthy = database === 'connected';

  return res.status(healthy ? 200 : 503).json({
    success: healthy,
    message: healthy ? 'Server is Working' : 'The database is not reachable',
    data: {
      status: healthy ? 'ok' : 'degraded',
      database,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

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
