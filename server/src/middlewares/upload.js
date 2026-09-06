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

/**
 * Caps how many uploads may be in flight at once, across the whole process.
 *
 * Memory storage is what makes this necessary. Every byte of every in-flight
 * upload is held in the heap until Cloudinary has taken it, and the multer
 * limits above are per-REQUEST: one request can hold 7 × 30 MB, so ten
 * concurrent uploads is roughly 2 GB and the process is killed. Nothing else in
 * the stack bounds it — the rate limiter counts requests over fifteen minutes,
 * which says nothing about how many are running right now.
 *
 * So uploads queue instead of piling up. A burst is served a few at a time and
 * the rest wait their turn, which is slower for the user who clicked last and
 * survivable for everyone, rather than fast for everyone until the container
 * dies. The queue itself is bounded too: past `maxQueued` the request is
 * refused immediately with a 503 and a retry hint, because a queue that grows
 * without limit is just the same memory problem wearing a hat.
 *
 * Tune with UPLOAD_MAX_CONCURRENT. The default of 3 assumes the 512 MB-ish
 * container these apps usually run in: 3 × 30 MB of buffers leaves plenty of
 * headroom for everything else the process is doing.
 */
const createUploadGate = ({ maxConcurrent, maxQueued = 20, timeoutMs = 30_000 }) => {
  let active = 0;
  const queue = [];

  const release = () => {
    active -= 1;
    const next = queue.shift();
    if (next) {
      active += 1;
      next();
    }
  };

  return (req, res, next) => {
    // Release exactly once, whichever way the response ends — a client that
    // disconnects mid-upload must not leak a slot and shrink the pool forever.
    let released = false;
    const releaseOnce = () => {
      if (released) return;
      released = true;
      release();
    };

    const start = () => {
      res.on('finish', releaseOnce);
      res.on('close', releaseOnce);
      next();
    };

    if (active < maxConcurrent) {
      active += 1;
      return start();
    }

    if (queue.length >= maxQueued) {
      res.set('Retry-After', '5');
      return next(
        ApiError.serviceUnavailable('The server is busy handling other uploads. Please try again in a moment.')
      );
    }

    // Do not let a slot be held forever by a stalled client.
    const timer = setTimeout(() => {
      const index = queue.indexOf(queued);
      if (index !== -1) queue.splice(index, 1);
      res.set('Retry-After', '5');
      next(ApiError.badRequest('The upload queue timed out. Please try again.'));
    }, timeoutMs);

    const queued = () => {
      clearTimeout(timer);
      start();
    };

    queue.push(queued);
    return undefined;
  };
};

export const uploadGate = createUploadGate({
  maxConcurrent: Number.parseInt(process.env.UPLOAD_MAX_CONCURRENT, 10) || 3,
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
