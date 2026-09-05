import { Router } from 'express';
import validate from '../../middlewares/validate.js';
import authenticate from '../../middlewares/authenticate.js';
import { authLimiter, refreshLimiter } from '../../middlewares/security.js';
import { loginSchema, changePasswordSchema, updateProfileSchema } from './auth.validation.js';
import {
  loginController,
  refreshController,
  logoutController,
  meController,
  updateProfileController,
  changePasswordController,
} from './auth.controller.js';

const router = Router();

router.post('/login', authLimiter, validate({ body: loginSchema }), loginController);
// Unauthenticated by design — it is the cookie that identifies the caller — so
// it carries its own limiter rather than only the global one.
router.post('/refresh', refreshLimiter, refreshController);
router.post('/logout', authenticate, logoutController);

router.get('/me', authenticate, meController);
router.patch('/me', authenticate, validate({ body: updateProfileSchema }), updateProfileController);
router.post(
  '/change-password',
  authenticate,
  authLimiter,
  validate({ body: changePasswordSchema }),
  changePasswordController
);

export default router;
