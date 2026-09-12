import multer from 'multer';
import ApiError from '../utils/ApiError.js';

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_VIDEO_BYTES = 30 * 1024 * 1024; // 30 MB

const storage = multer.memoryStorage();

// A browser derives a file's type from its extension, and that mapping is often
// missing or wrong — a .jfif with no entry in the Windows registry, or a JPEG
// that was saved as .png. The real bytes are checked in enforceFileLimits, so a
// vague or absent type is settled there rather than refused on the label alone.
const VAGUE_TYPES = ['', 'application/octet-stream', 'binary/octet-stream'];

const EXTENSION_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  webm: 'video/webm',
};

const typeFromName = (name = '') => {
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  return EXTENSION_TYPES[extension] || '';
};

/** The declared type, or the one the extension implies when the browser gave us nothing useful. */
const declaredType = (file) =>
  VAGUE_TYPES.includes(file.mimetype) ? typeFromName(file.originalname) : file.mimetype;

const makeFilter = (allowed, message) => (_req, file, cb) => {
  const type = declaredType(file);
  if (allowed.includes(type)) {
    file.mimetype = type;
    return cb(null, true);
  }
  return cb(ApiError.badRequest(message(file.mimetype || 'unknown')));
};

const fileFilter = makeFilter(
  [...IMAGE_TYPES, ...VIDEO_TYPES],
  (type) =>
    `Unsupported file type "${type}". Allowed: JPG, PNG, GIF, WEBP images and MP4, MOV, WEBM videos.`
);

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_VIDEO_BYTES, files: 7, fields: 20 },
});

/** Single-image routes (branding, branch logos) never need the video ceiling. */
export const imageUpload = multer({
  storage,
  fileFilter: makeFilter(
    IMAGE_TYPES,
    (type) => `"${type}" is not an image. Use JPG, PNG, GIF or WEBP.`
  ),
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

const TYPE_LABELS = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/gif': 'GIF',
  'image/webp': 'WEBP',
  'video/mp4': 'MP4',
  'video/quicktime': 'MOV',
  'video/webm': 'WEBM',
};

/**
 * What the buffer really holds, or '' when it is nothing we recognise.
 *
 * The declared type is only a hint. A perfectly good photo saved as .png may hold
 * JPEG or WEBP bytes, so the header decides the answer and the declared type is
 * merely tried first because it is usually right.
 */
const sniffType = (buffer, mimetype) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return '';
  if (SIGNATURES[mimetype]?.(buffer)) return mimetype === 'image/jpg' ? 'image/jpeg' : mimetype;
  return Object.keys(TYPE_LABELS).find((type) => SIGNATURES[type](buffer)) || '';
};

export const enforceFileLimits = (req, _res, next) => {
  const files = req.files || (req.file ? [req.file] : []);
  for (const file of files) {
    const isImage = IMAGE_TYPES.includes(file.mimetype);
    const allowed = isImage ? IMAGE_TYPES : VIDEO_TYPES;
    const cap = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (file.size > cap) {
      return next(
        ApiError.badRequest(
          `"${file.originalname}" is ${(file.size / 1048576).toFixed(1)} MB. ` +
            `${isImage ? 'Images' : 'Videos'} must be under ${cap / 1048576} MB.`
        )
      );
    }

    const actualType = sniffType(file.buffer, file.mimetype);
    if (!actualType) {
      return next(
        ApiError.badRequest(
          `"${file.originalname}" is not a valid ${isImage ? 'image' : 'video'} file. ` +
            'Its contents are damaged or in a format we do not support.'
        )
      );
    }

    if (!allowed.includes(actualType)) {
      return next(
        ApiError.badRequest(
          `"${file.originalname}" is really a ${TYPE_LABELS[actualType]} file, which is not allowed here.`
        )
      );
    }

    // Trust the bytes from here on, so storage and Cloudinary see the true type
    // even when the file name says otherwise.
    file.mimetype = actualType;
  }
  return next();
};

export const isVideo = (mimetype) => VIDEO_TYPES.includes(mimetype);
