import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import userRoutes from '../modules/users/user.routes.js';
import branchRoutes from '../modules/branches/branch.routes.js';
import perfumeRoutes from '../modules/perfumes/perfume.routes.js';
import billRoutes from '../modules/bills/bill.routes.js';
import dashboardRoutes from '../modules/dashboard/dashboard.routes.js';
import settingsRoutes from '../modules/settings/settings.routes.js';
import uploadRoutes from '../modules/uploads/upload.routes.js';
import geoRoutes from '../modules/geo/geo.routes.js';

const router = Router();

router.get('/health', (_req, res) => res.type('text/plain').send('Server is Working'));

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
