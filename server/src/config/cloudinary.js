import { v2 as cloudinary } from 'cloudinary';
import env from './env.js';
import logger from './logger.js';
import ApiError from '../utils/ApiError.js';

if (env.cloudinary.enabled) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
} else {
  logger.warn('Cloudinary credentials are not set — media uploads will be rejected');
}

/**
 * Stream a multer memory buffer straight to Cloudinary.
 * Nothing touches disk, so the API stays stateless and container friendly.
 */
export const uploadBuffer = (buffer, { folder = '', resourceType = 'image', publicId } = {}) =>
  new Promise((resolve, reject) => {
    if (!env.cloudinary.enabled) {
      return reject(
        ApiError.badRequest('Media storage is not configured. Add your Cloudinary credentials to server/.env')
      );
    }

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: [env.cloudinary.folder, folder].filter(Boolean).join('/'),
        resource_type: resourceType,
        public_id: publicId,
        overwrite: true,
        // Deliver the smallest sane file for the browser that asks for it.
        transformation:
          resourceType === 'image'
            ? [{ quality: 'auto:good', fetch_format: 'auto' }]
            : undefined,
      },
      (error, result) => {
        if (error) return reject(ApiError.badRequest(error.message || 'Upload to Cloudinary failed'));
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
          format: result.format,
          resourceType: result.resource_type,
        });
      }
    );

    stream.end(buffer);
  });

/**
 * Every asset this app creates is written under CLOUDINARY_FOLDER by
 * `uploadBuffer`. Anything outside it belongs to another project sharing the
 * same Cloudinary account, and nothing here may touch it.
 */
export const assertManagedAsset = (publicId) => {
  const id = String(publicId || '');
  const root = `${env.cloudinary.folder}/`;
  if (!id.startsWith(root) || id.includes('..')) {
    throw ApiError.badRequest('That file does not belong to this store.');
  }
  return id;
};

/** Branding lives here and is replaced only through its own guarded endpoints. */
export const isBrandingAsset = (publicId) =>
  String(publicId || '').startsWith(`${env.cloudinary.folder}/branding`);

/**
 * Deletes an asset. `strict` propagates an upstream failure instead of
 * swallowing it — used where deletion is the point of the request, rather than
 * opportunistic cleanup after a successful replace.
 */
export const destroyAsset = async (publicId, resourceType = 'image', { strict = false } = {}) => {
  if (!publicId) return null;

  try {
    assertManagedAsset(publicId);
  } catch (error) {
    // Opportunistic cleanup of a legacy id must not fail the request; a strict
    // caller is deleting on purpose and has to hear about it.
    if (strict) throw error;
    logger.warn(`Refusing to destroy unmanaged asset "${publicId}"`);
    return null;
  }

  if (!env.cloudinary.enabled) {
    if (strict) throw ApiError.badRequest('Media storage is not configured.');
    return null;
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    if (strict && result?.result !== 'ok' && result?.result !== 'not found') {
      throw ApiError.badRequest(`Could not remove that file (${result?.result || 'unknown error'}).`);
    }
    return result;
  } catch (error) {
    if (strict) throw error;
    // Opportunistic cleanup must never fail the user's request — log and move on.
    logger.warn(`Cloudinary destroy failed for ${publicId}: ${error.message}`);
    return null;
  }
};
