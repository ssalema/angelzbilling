import { Router } from 'express';
import { z } from 'zod';
import authenticate from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import validate from '../../middlewares/validate.js';
import { imageUpload, enforceFileLimits } from '../../middlewares/upload.js';
import { createBranchSchema, updateBranchSchema, listBranchQuerySchema } from './branch.validation.js';
import {
  listBranches,
  getBranch,
  createBranch,
  updateBranch,
  deleteBranch,
  toggleBranchStatus,
  uploadBranchLogo,
  removeBranchLogo,
} from './branch.controller.js';

const idParam = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid branch id') });

const router = Router();
router.use(authenticate);

// Anyone signed in can READ branches (they populate pickers and bill headers).
router.get('/', validate({ query: listBranchQuerySchema }), listBranches);
router.get('/:id', validate({ params: idParam }), getBranch);

// Writing to the branch registry is a super admin responsibility.
router.post('/', authorize('superadmin'), validate({ body: createBranchSchema }), createBranch);
router.patch(
  '/:id',
  authorize('superadmin'),
  validate({ params: idParam, body: updateBranchSchema }),
  updateBranch
);
router.post(
  '/:id/logo',
  authorize('superadmin'),
  validate({ params: idParam }),
  imageUpload.single('file'),
  enforceFileLimits,
  uploadBranchLogo
);
router.delete('/:id/logo', authorize('superadmin'), validate({ params: idParam }), removeBranchLogo);
router.patch('/:id/status', authorize('superadmin'), validate({ params: idParam }), toggleBranchStatus);
router.delete('/:id', authorize('superadmin'), validate({ params: idParam }), deleteBranch);

export default router;
