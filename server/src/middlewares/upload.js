import multer from 'multer';
import ApiError from '../utils/ApiError.js';

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_VIDEO_BYTES = 30 * 1024 * 1024; // 30 MB

/**
 * Memory storage on purpose: buffers stream straight to Cloudinary, so the API
 * writes nothing to disk and can scale horizontally without shared volumes.
 */
const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  if ([...IMAGE_TYPES, ...VIDEO_TYPES].includes(file.mimetype)) return cb(null, true);
  return cb(
    ApiError.badRequest(
      `Unsupported file type "${file.mimetype}". Allowed: JPG, PNG, GIF, WEBP images and MP4, MOV, WEBM videos.`
    )
  );
};

/**
 * Buffers live in memory, so multer's own limits are the real ceiling — the
 * `enforceFileLimits` check below runs only after a file has already been read
 * in, and cannot stop a large one from being held. `files` matches the largest
 * `upload.array` in the app so a request can hold at most 7 × 30 MB.
 */
export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_VIDEO_BYTES, files: 7, fields: 20 },
});

/** Single-image routes (branding, branch logos) never need the video ceiling. */
export const imageUpload = multer({
  storage,
  fileFilter: (_req, file, cb) =>
    IMAGE_TYPES.includes(file.mimetype)
      ? cb(null, true)
      : cb(ApiError.badRequest(`"${file.mimetype}" is not an image. Use JPG, PNG, GIF or WEBP.`)),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 20 },
});

/** Per-file size check — images get a tighter cap than the multer-wide limit. */
export const enforceFileLimits = (req, _res, next) => {
  const files = req.files || (req.file ? [req.file] : []);
  for (const file of files) {
    const isImage = IMAGE_TYPES.includes(file.mimetype);
    const cap = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (file.size > cap) {
      return next(
        ApiError.badRequest(
          `"${file.originalname}" is ${(file.size / 1048576).toFixed(1)} MB. ` +
            `${isImage ? 'Images' : 'Videos'} must be under ${cap / 1048576} MB.`
        )
      );
    }
  }
  return next();
};

export const isVideo = (mimetype) => VIDEO_TYPES.includes(mimetype);

export default upload;
