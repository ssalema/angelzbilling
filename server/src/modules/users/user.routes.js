import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.js';
import { invalidateDashboardOnWrite } from '../../middlewares/cache.js';
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

// Account management is a Super Admin only module, end to end.
router.use(authenticate, authorize('superadmin'));
// The summary card counts active staff, so account writes invalidate it too.
router.use(invalidateDashboardOnWrite());

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
