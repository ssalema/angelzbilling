import { z } from 'zod';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../../utils/ApiResponse.js';
import { isVideo } from '../../middlewares/upload.js';
import {
  uploadBuffer,
  destroyAsset,
  assertManagedAsset,
  isBrandingAsset,
} from '../../config/cloudinary.js';

/**
 * The destination folder arrives as a plain form field, so it is caller input
 * and is never interpolated into a Cloudinary path as-is: one slug segment,
 * no separators and no dots, which rules out escaping CLOUDINARY_FOLDER.
 */
const FOLDER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/**
 * Branding has its own guarded endpoints under /settings. Letting it be written
 * here too would hand any branch admin a way around the superadmin gate.
 */
const RESERVED_FOLDERS = new Set(['branding']);

const resolveFolder = (raw) => {
  const folder = String(raw ?? 'perfumes').trim().toLowerCase();
  if (!FOLDER_PATTERN.test(folder)) {
    throw ApiError.badRequest('That upload folder name is not allowed.');
  }
  if (RESERVED_FOLDERS.has(folder)) {
    throw ApiError.forbidden('Branding is managed from Settings, not the media library.');
  }
  return folder;
};

export const removeAssetSchema = z.object({
  publicId: z.string().trim().min(1, 'Tell us which file to remove'),
  resourceType: z.enum(['image', 'video']).default('image'),
});

/**
 * POST /uploads — multipart `files` (repeatable) plus a `folder` field.
 * Responds with the asset array the media picker stores on the perfume.
 */
export const uploadAssets = asyncHandler(async (req, res) => {
  const files = req.files || [];
  if (!files.length) throw ApiError.badRequest('Choose at least one file to upload');

  const folder = resolveFolder(req.body?.folder);

  // Sequential on purpose: a parallel burst of 30 MB buffers is what the memory
  // storage in the upload middleware is sized to avoid.
  const assets = [];
  for (const file of files) {
    const resourceType = isVideo(file.mimetype) ? 'video' : 'image';
    assets.push(await uploadBuffer(file.buffer, { folder, resourceType }));
  }

  return sendCreated(res, {
    message: `${assets.length} file${assets.length === 1 ? '' : 's'} uploaded`,
    data: assets,
  });
});

/**
 * DELETE /uploads — body { publicId, resourceType }.
 *
 * Two guards stand between an admin and the rest of the Cloudinary account:
 * the id must live under this store's folder (400), and it must not be a
 * branding asset (403), which only a superadmin may replace via /settings.
 */
export const removeAsset = asyncHandler(async (req, res) => {
  const { publicId, resourceType } = req.body;

  assertManagedAsset(publicId);
  if (isBrandingAsset(publicId)) {
    throw ApiError.forbidden('Branding is managed from Settings, not the media library.');
  }

  await destroyAsset(publicId, resourceType, { strict: true });

  return sendSuccess(res, { message: 'File removed', data: { publicId } });
});
