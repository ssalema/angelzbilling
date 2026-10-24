import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.js';
import { invalidateDashboardOnWrite, invalidateAccountOnWrite } from '../../middlewares/cache.js';
import { announceOnWrite } from '../../middlewares/realtime.js';
import { authorize } from '../../middlewares/authorize.js';
import validate from '../../middlewares/validate.js';
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  listUserQuerySchema,
  idParamSchema,
} from './user.validation.js';
import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  toggleUserStatus,
  resetUserPassword,
  deleteUser,
} from './user.controller.js';

const router = Router();

// Super Admin only.
router.use(authenticate, authorize('superadmin'));
// The dashboard counts active staff, so account writes clear its cache.
router.use(invalidateDashboardOnWrite());
router.use(invalidateAccountOnWrite());
// Deactivating, deleting or resetting an account signs out its open tabs.
router.use(
  announceOnWrite({
    resource: 'users',
    revokes: ['/:id/status', '/:id', '/:id/reset-password'],
  })
);

router.get('/', validate({ query: listUserQuerySchema }), listUsers);
router.post('/', validate({ body: createUserSchema }), createUser);
router.get('/:id', validate({ params: idParamSchema }), getUser);
router.patch('/:id', validate({ params: idParamSchema, body: updateUserSchema }), updateUser);
router.patch('/:id/status', validate({ params: idParamSchema }), toggleUserStatus);
router.post(
  '/:id/reset-password',
  validate({ params: idParamSchema, body: resetPasswordSchema }),
  resetUserPassword
);
router.delete('/:id', validate({ params: idParamSchema }), deleteUser);

export default router;
