// Shrinks a phone photo before it goes up the wire. A 4000px, 4 MB camera shot
// is delivered at a few hundred pixels anyway (see utils/image.js), and on a
// slow mobile link it is the difference between a minute's upload and seconds.

// Only lossy photo formats. PNGs are usually logos with transparency, GIFs may
// be animated, and both would be harmed by a round trip through a canvas.
const COMPRESSIBLE = ['image/jpeg', 'image/webp'];

const SMALL_ENOUGH_BYTES = 800 * 1024;
const QUALITY = 0.85;

/** Resolves to a smaller copy of `file`, or to `file` itself when that is not an improvement. */
export const compressImage = async (file, { maxEdge = 2400 } = {}) => {
  if (!(file instanceof Blob) || !COMPRESSIBLE.includes(file.type)) return file;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= SMALL_ENOUGH_BYTES) {
      bitmap.close?.();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, file.type, QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name, { type: file.type, lastModified: file.lastModified });
  } catch {
    // An image the browser cannot decode goes up as it is; the server says why if it is refused.
    return file;
  }
};

export default compressImage;
