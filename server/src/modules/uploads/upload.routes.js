import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import validate from '../../middlewares/validate.js';
import { upload, enforceFileLimits, uploadGate } from '../../middlewares/upload.js';
import { uploadAssets, removeAsset, removeAssetSchema } from './upload.controller.js';

const router = Router();

router.use(authenticate);

// The media library backs perfume records, so it is an admin+ tool. Billing
// staff never upload; they only read the images already attached to a perfume.
router.post(
  '/',
  authorize('superadmin', 'admin'),
  uploadGate,
  upload.array('files', 7),
  enforceFileLimits,
  uploadAssets
);

// Body rather than a :publicId param — Cloudinary ids contain slashes, so they
// do not survive a path segment intact.
router.delete('/', authorize('superadmin', 'admin'), validate({ body: removeAssetSchema }), removeAsset);

export default router;
