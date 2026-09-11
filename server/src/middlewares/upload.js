import multer from 'multer';
import ApiError from '../utils/ApiError.js';

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_VIDEO_BYTES = 30 * 1024 * 1024; // 30 MB

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  if ([...IMAGE_TYPES, ...VIDEO_TYPES].includes(file.mimetype)) return cb(null, true);
  return cb(
    ApiError.badRequest(
      `Unsupported file type "${file.mimetype}". Allowed: JPG, PNG, GIF, WEBP images and MP4, MOV, WEBM videos.`
    )
  );
};

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

// Caps how many uploads may be in flight at once, across the whole process.
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

// What the bytes actually are, as opposed to what the uploader said they are.
const startsWith = (buffer, bytes, offset = 0) =>
  bytes.every((byte, index) => buffer[offset + index] === byte);

const ascii = (buffer, offset, text) =>
  startsWith(buffer, [...text].map((character) => character.charCodeAt(0)), offset);

const SIGNATURES = {
  'image/jpeg': (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  'image/png': (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/gif': (b) => ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a'),
  'image/webp': (b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP'),
  'video/mp4': (b) => ascii(b, 4, 'ftyp'),
  'video/quicktime': (b) => ascii(b, 4, 'ftyp') || ascii(b, 4, 'moov') || ascii(b, 4, 'mdat'),
  'video/webm': (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]),
};

SIGNATURES['image/jpg'] = SIGNATURES['image/jpeg'];

/** True when the buffer's own header agrees with the declared type. */
const contentMatchesType = (buffer, mimetype) => {
  const check = SIGNATURES[mimetype];
  if (!check) return false;
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  return check(buffer);
};

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

    if (!contentMatchesType(file.buffer, file.mimetype)) {
      return next(
        ApiError.badRequest(
          `"${file.originalname}" is not a valid ${isImage ? 'image' : 'video'} file. ` +
            'Its contents do not match its file type.'
        )
      );
    }
  }
  return next();
};

export const isVideo = (mimetype) => VIDEO_TYPES.includes(mimetype);
