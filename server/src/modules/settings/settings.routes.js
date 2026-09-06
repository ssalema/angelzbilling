import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.js';
import { requireGlobalSuperAdmin } from '../../middlewares/authorize.js';
import validate from '../../middlewares/validate.js';
import { imageUpload, enforceFileLimits, uploadGate } from '../../middlewares/upload.js';
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

/**
 * These settings ARE the main business: its name, tagline, contact details,
 * address, GSTIN, logo and favicon, plus store-wide billing rules and the
 * branch switch. A branch never overrides them, and a Super Admin assigned to a
 * branch cannot change them — only the main Super Admin can.
 */
const mainBusinessOnly = requireGlobalSuperAdmin(
  'Only the main Super Admin can change the main business details. Your account manages its branch only.'
);

router.patch('/', mainBusinessOnly, validate({ body: updateSettingsSchema }), updateSettings);
router.post(
  '/branding/:kind',
  mainBusinessOnly,
  // Ahead of multer so a queued request holds no buffer while it waits.
  uploadGate,
  imageUpload.single('file'),
  enforceFileLimits,
  uploadBranding
);
router.delete('/branding/:kind', mainBusinessOnly, removeBranding);

export default router;
