/**
 * Cloudinary delivery transformations.
 *
 * Uploads are already stored with `quality:auto,fetch_format:auto`, but that
 * only decides the format and compression of the ORIGINAL — it does not resize
 * anything. So a 2000px product photograph was being sent down the wire in full
 * and then scaled to a 40px avatar by the browser, on every row of every list.
 * Those bytes are wasted entirely: the pixels are thrown away before they are
 * ever drawn.
 *
 * Two rules keep the saving from turning into a soft, cheap-looking UI:
 *
 *  1. RESIZE ONLY WHAT HAS A KNOWN BOX. A 40px avatar can be asked for at a
 *     known size. A logo stretched to `width: 100%` of its container cannot —
 *     its rendered width depends on the viewport, so any fixed request is a
 *     guess, and a guess that comes in low is an upscale. Logos therefore get
 *     format and quality optimisation but keep their original dimensions.
 *
 *  2. ASK FOR RETINA PIXELS EXPLICITLY. Cloudinary's `dpr_auto` reads the DPR
 *     client hint, which a browser only sends once the server has advertised
 *     `Accept-CH` — so in practice it resolves to 1.0 and every image is soft
 *     on a retina screen. The sizes below are therefore requested at 2x the CSS
 *     box and left for the browser to draw down, which is always sharp.
 *
 * Anything that is not a Cloudinary URL is returned untouched, so this is safe
 * to wrap around a value that might be a data: URI from a file picker, a blob:
 * preview, an empty string, or a logo hosted somewhere else.
 */

/** Cloudinary delivery URLs always contain this segment before the transforms. */
const UPLOAD_SEGMENT = '/upload/';

/**
 * The pixel density to request for a fixed-size box.
 *
 * 2 covers every mainstream retina display. Going to 3 for the rare high-DPI
 * phone would add real bytes to every row of every list for a difference no one
 * can see at these sizes.
 */
const RETINA = 2;

/**
 * Inserts a transformation into a Cloudinary URL.
 *
 * With no `w`/`h` this is purely a format and quality pass — the image keeps
 * its original dimensions and simply arrives as WebP or AVIF instead of PNG,
 * which is where most of the saving lives anyway and costs nothing in sharpness.
 *
 * @param {string} url     the stored secure_url
 * @param {object} options
 * @param {number} options.w      CSS width of the box it will be drawn into
 * @param {number} options.h      CSS height, when the box is fixed in both axes
 * @param {string} options.crop   'fill' crops to fill the box; 'fit' (default)
 *                                letterboxes inside it without cropping
 * @param {number} options.dpr    density multiplier; defaults to RETINA
 */
export const cdnImage = (url, { w, h, crop = 'fit', dpr = RETINA } = {}) => {
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

/**
 * The sizes actually used in the UI, named so a caller states intent rather
 * than a magic number — and so changing the avatar size is one edit here.
 *
 * Every entry that names a size is stating a box the UI genuinely fixes in CSS.
 * Where the UI does not fix one, the entry deliberately does not resize.
 */
export const IMG = {
  /** 40-48px table avatars and dashboard list rows. */
  avatar: (url) => cdnImage(url, { w: 48, h: 48, crop: 'fill' }),

  /** ~96px thumbnails in the media uploader and picker grids. */
  thumb: (url) => cdnImage(url, { w: 96, h: 96, crop: 'fill' }),

  /** Product gallery on the perfume view / preview step. */
  preview: (url) => cdnImage(url, { w: 480, crop: 'fit' }),

  /**
   * Store and branch logos.
   *
   * NOT resized, on purpose. These are drawn at `width: 100%` of a container
   * whose width changes with the viewport — the login card gives it about
   * 348px, the sidebar about 216px, and a wider breakpoint gives it more — so
   * there is no single correct width to ask for, and asking low visibly
   * softened the wordmark. A logo is also the one image a user reads as
   * "is this app well made", so it is the wrong place to trade sharpness for
   * bytes. `f_auto` still converts it to WebP/AVIF, which is most of the
   * saving, at identical dimensions to the original.
   */
  logo: (url) => cdnImage(url),

  /**
   * The printed slip. Also unresized: html2canvas rasterises this at 2-3x for
   * the PDF, so anything shrunk here shows up as a blurry mark on a document
   * the customer keeps.
   */
  print: (url) => cdnImage(url),
};

export default cdnImage;
