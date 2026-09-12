import { Router } from 'express';
import validate from '../../middlewares/validate.js';
import authenticate from '../../middlewares/authenticate.js';
import { authLimiter, refreshLimiter } from '../../middlewares/security.js';
import { invalidateAccountOnWrite } from '../../middlewares/cache.js';
import { imageUpload, enforceFileLimits, uploadGate } from '../../middlewares/upload.js';
import { loginSchema, changePasswordSchema, updateProfileSchema } from './auth.validation.js';
import {
  loginController,
  refreshController,
  logoutController,
  meController,
  updateProfileController,
  uploadAvatarController,
  removeAvatarController,
  changePasswordController,
} from './auth.controller.js';

const router = Router();

router.post('/login', authLimiter, validate({ body: loginSchema }), loginController);
// Unauthenticated by design — it is the cookie that identifies the caller — so
// it carries its own limiter rather than only the global one.
router.post('/refresh', refreshLimiter, refreshController);
router.post('/logout', authenticate, logoutController);

router.get('/me', authenticate, meController);
const evictSelf = invalidateAccountOnWrite({ target: 'self' });

router.patch(
  '/me',
  authenticate,
  evictSelf,
  validate({ body: updateProfileSchema }),
  updateProfileController
);
// Your own photo — every signed-in role may set one on their own account.
router.post(
  '/me/avatar',
  authenticate,
  evictSelf,
  // Ahead of multer so a queued request holds no buffer while it waits.
  uploadGate,
  imageUpload.single('file'),
  enforceFileLimits,
  uploadAvatarController
);
router.delete('/me/avatar', authenticate, evictSelf, removeAvatarController);

router.post(
  '/change-password',
  authenticate,
  evictSelf,
  authLimiter,
  validate({ body: changePasswordSchema }),
  changePasswordController
);

export default router;
