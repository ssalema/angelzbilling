// Cloudinary delivery transformations.

/** Cloudinary delivery URLs always contain this segment before the transforms. */
const UPLOAD_SEGMENT = '/upload/';

// The pixel density to request for a fixed-size box.
const RETINA = 2;

// Inserts a transformation into a Cloudinary URL.
const cdnImage = (url, { w, h, crop = 'fit', dpr = RETINA } = {}) => {
  if (!url || typeof url !== 'string') return url || '';

  // Only Cloudinary delivery URLs can carry transforms. A data:/blob: preview
  // or a third-party logo must pass through untouched.
  const marker = url.indexOf(UPLOAD_SEGMENT);
  if (marker === -1 || !url.includes('res.cloudinary.com')) return url;

  // Already transformed by an earlier call — do not stack transformations.
  const rest = url.slice(marker + UPLOAD_SEGMENT.length);
  if (/^[a-z]+_[^/]+\//.test(rest)) return url;

  const parts = [];
  // Multiplied here rather than passed as `dpr_`, so the width in the URL is
  // the real pixel width being delivered and is obvious when reading it.
  if (w) parts.push(`w_${Math.round(w * dpr)}`);
  if (h) parts.push(`h_${Math.round(h * dpr)}`);
  if (w || h) parts.push(`c_${crop}`);
  parts.push('q_auto', 'f_auto');

  return `${url.slice(0, marker + UPLOAD_SEGMENT.length)}${parts.join(',')}/${rest}`;
};

export const IMG = {
  /** 40-48px table avatars and dashboard list rows. */
  avatar: (url) => cdnImage(url, { w: 48, h: 48, crop: 'fill' }),

  /** ~96px thumbnails in the media uploader and picker grids. */
  thumb: (url) => cdnImage(url, { w: 96, h: 96, crop: 'fill' }),

  /** Product gallery on the perfume view / preview step. */
  preview: (url) => cdnImage(url, { w: 480, crop: 'fit' }),

  // Store and branch logos.
  logo: (url) => cdnImage(url),

  // The printed slip.
  print: (url) => cdnImage(url),
};
