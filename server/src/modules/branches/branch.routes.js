import { Router } from 'express';
import { z } from 'zod';
import authenticate from '../../middlewares/authenticate.js';
import { authorize, requireGlobalSuperAdmin } from '../../middlewares/authorize.js';
import validate from '../../middlewares/validate.js';
import { imageUpload, enforceFileLimits, uploadGate } from '../../middlewares/upload.js';
import { createBranchSchema, updateBranchSchema, listBranchQuerySchema } from './branch.validation.js';
import {
  listBranches,
  getBranch,
  createBranch,
  updateBranch,
  deleteBranch,
  toggleBranchStatus,
  uploadBranchBranding,
  removeBranchBranding,
} from './branch.controller.js';

const idParam = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid branch id') });
// Same two marks the store carries, on the same shaped path as /settings/branding.
const brandingParam = idParam.extend({ kind: z.enum(['logo', 'favicon']) });

const router = Router();
router.use(authenticate);

// Anyone signed in can READ branches (they populate pickers and bill headers).
router.get('/', validate({ query: listBranchQuerySchema }), listBranches);
router.get('/:id', validate({ params: idParam }), getBranch);

// Adding a location to the registry is a store-wide decision: main Super Admin
// only. Editing one branch's own details is branch-level, so a Super Admin
// assigned to that branch may do it — the controller checks which branch.
router.post('/', requireGlobalSuperAdmin(), validate({ body: createBranchSchema }), createBranch);
router.patch(
  '/:id',
  authorize('superadmin'),
  validate({ params: idParam, body: updateBranchSchema }),
  updateBranch
);
router.post(
  '/:id/branding/:kind',
  authorize('superadmin'),
  validate({ params: brandingParam }),
  // Ahead of multer so a queued request holds no buffer while it waits.
  uploadGate,
  imageUpload.single('file'),
  enforceFileLimits,
  uploadBranchBranding
);
router.delete(
  '/:id/branding/:kind',
  authorize('superadmin'),
  validate({ params: brandingParam }),
  removeBranchBranding
);
// Taking a location out of service, or off the books entirely, is store-wide.
router.patch('/:id/status', requireGlobalSuperAdmin(), validate({ params: idParam }), toggleBranchStatus);
router.delete('/:id', requireGlobalSuperAdmin(), validate({ params: idParam }), deleteBranch);

export default router;
