import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import validate from '../../middlewares/validate.js';
import { imageUpload, enforceFileLimits } from '../../middlewares/upload.js';
import {
  getSettings,
  getPublicSettings,
  updateSettings,
  uploadBranding,
  removeBranding,
  updateSettingsSchema,
} from './settings.controller.js';

const router = Router();

// The login screen needs the store name and logo before anyone is signed in.
router.get('/public', getPublicSettings);

router.use(authenticate);

// Reading settings is fine for anyone — the bill print header uses them.
router.get('/', getSettings);

// Changing store identity and branding is a Super Admin responsibility.
router.patch('/', authorize('superadmin'), validate({ body: updateSettingsSchema }), updateSettings);
router.post(
  '/branding/:kind',
  authorize('superadmin'),
  imageUpload.single('file'),
  enforceFileLimits,
  uploadBranding
);
router.delete('/branding/:kind', authorize('superadmin'), removeBranding);

export default router;
