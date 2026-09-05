import { z } from 'zod';

/**
 * Mirrors the server's Zod schema so the wizard catches problems before a round
 * trip. The server still re-validates — this copy is UX, that one is truth.
 */

const media = z.object({
  url: z.string().min(1),
  publicId: z.string().optional().default(''),
  alt: z.string().optional().default(''),
});

const variantSchema = z.object({
  _id: z.string().optional(),
  label: z.string().min(1, 'Label is required'),
  options: z.record(z.string()).default({}),
  sku: z
    .string()
    .trim()
    .min(2, 'SKU is required')
    .max(60)
    .regex(/^[A-Za-z0-9-_]+$/, 'Letters, numbers, hyphens and underscores only'),
  mrp: z.coerce.number({ invalid_type_error: 'Enter a price' }).min(0, 'Price cannot be negative'),
  discountPercent: z.coerce.number().min(0, 'Cannot be negative').max(100, 'Cannot exceed 100%').default(0),
  // Read-only here: the server derives it from the Size option ("100gm" -> 100).
  // This is how much the perfume's shared stock drops per unit sold — a variant
  // has no stock field of its own, because every size pours from one bulk pool.
  sizeGrams: z.coerce.number().min(0).optional(),
  isActive: z.boolean().default(true),
  image: z.object({ url: z.string().default(''), publicId: z.string().default('') }).default({ url: '', publicId: '' }),
  barcode: z.string().default(''),
  hsnCode: z.string().default(''),
});

export const perfumeSchema = z
  .object({
    // Step 1 — Basic information
    name: z.string().trim().min(2, 'Perfume name must be at least 2 characters').max(180),
    sku: z
      .string()
      .trim()
      .min(2, 'SKU must be at least 2 characters')
      .max(60)
      .regex(/^[A-Za-z0-9-_]+$/, 'Letters, numbers, hyphens and underscores only'),
    brand: z.string().trim().max(80).default(''),
    category: z.string().trim().max(80).default(''),
    subCategory: z.string().trim().max(80).default(''),
    fragranceFamily: z.string().trim().max(80).default(''),
    concentration: z.string().trim().max(80).default(''),
    shortDescription: z.string().trim().max(300, 'Keep this under 300 characters').default(''),
    description: z.string().trim().max(8000).default(''),
    // Pricing is not typed on this step any more: it belongs to the variants
    // step. With one size only, that step's base price fills these in; with
    // variants on, they are derived from the cheapest active row on save.
    mrp: z.coerce.number({ invalid_type_error: 'Enter a price' }).min(0, 'Price cannot be negative').default(0),
    discountPercent: z.coerce.number().min(0, 'Cannot be negative').max(100, 'Cannot exceed 100%').default(0),
    // Stock is bulk weight in grams throughout, so decimals are allowed. This is
    // the perfume's ONE inventory figure — variants draw down this same pool.
    sizeGrams: z.coerce.number().min(0, 'Pack size cannot be negative').default(0),
    stock: z.coerce.number().min(0, 'Stock cannot be negative').default(0),
    lowStockThreshold: z.coerce.number().min(0).default(100),
    hsnCode: z.string().trim().max(20).default(''),
    barcode: z.string().trim().max(60).default(''),
    tags: z.array(z.string()).max(20).default([]),

    // Step 2 — Features & FAQs
    features: z.array(z.string().min(1)).max(20, 'Up to 20 features').default([]),
    faqs: z
      .array(
        z.object({
          question: z.string().trim().min(3, 'Question is too short').max(200),
          answer: z.string().trim().min(3, 'Answer is too short').max(2000),
        })
      )
      .max(20)
      .default([]),

    // Step 3 — Media
    images: z.array(media).max(5, 'At most 5 images').default([]),
    videos: z.array(media).max(2, 'At most 2 videos').default([]),

    // Step 4 — Variants
    hasVariants: z.boolean().default(false),
    variantAttributes: z
      .array(
        z.object({
          name: z.string().trim().min(1, 'Name the attribute'),
          selectorStyle: z.enum(['automatic', 'chip', 'dropdown', 'swatch']).default('automatic'),
          values: z.array(z.string().min(1)).min(1, 'Add at least one value'),
        })
      )
      .default([]),
    variants: z.array(variantSchema).default([]),

    // Step 5 — Publish
    status: z.enum(['draft', 'published', 'archived']).default('draft'),
  })
  .superRefine((data, ctx) => {
    if (data.hasVariants) {
      if (!data.variantAttributes.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variantAttributes'],
          message: 'Add an attribute (for example Size) before generating combinations',
        });
      }
      if (!data.variants.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variants'],
          message: 'Generate at least one combination, or switch variants off',
        });
      }

      // Duplicate SKUs would collide on the server; catch it in the table instead.
      const seen = new Map();
      data.variants.forEach((variant, index) => {
        const sku = variant.sku?.toUpperCase();
        if (seen.has(sku)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['variants', index, 'sku'],
            message: 'This SKU is used by another variant',
          });
        }
        seen.set(sku, index);
      });

      if (data.variants.length && !data.variants.some((v) => v.isActive)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variants'],
          message: 'Keep at least one variant active',
        });
      }

      // Variants are now the only place a price is entered, so an active row
      // left at zero would leave the perfume unsellable at that size.
      data.variants.forEach((variant, index) => {
        if (variant.isActive && !(Number(variant.mrp) > 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['variants', index, 'mrp'],
            message: 'Set a price for this variant',
          });
        }
      });
    }

    if (data.status === 'published' && !data.images.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['images'],
        message: 'Add at least one image before publishing',
      });
    }
  });

/** Which fields each wizard step is responsible for, used by "Continue". */
export const stepFields = {
  0: ['name', 'sku', 'brand', 'category', 'subCategory', 'fragranceFamily', 'concentration', 'shortDescription', 'description', 'sizeGrams', 'stock', 'lowStockThreshold', 'tags'],
  1: ['features', 'faqs'],
  2: ['images', 'videos'],
  3: ['hasVariants', 'variantAttributes', 'variants', 'mrp', 'discountPercent'],
  4: ['status'],
};

export const emptyPerfume = {
  name: '',
  sku: '',
  brand: '',
  category: '',
  subCategory: '',
  fragranceFamily: '',
  concentration: '',
  shortDescription: '',
  description: '',
  mrp: '',
  discountPercent: 0,
  sizeGrams: '',
  stock: 0,
  lowStockThreshold: 100,
  hsnCode: '',
  barcode: '',
  tags: [],
  features: [],
  faqs: [],
  images: [],
  videos: [],
  hasVariants: true,
  // Perfume is nearly always sold by fill size, so the usual ladder is
  // pre-filled — values can still be removed or added before generating.
  variantAttributes: [
    {
      name: 'Size',
      selectorStyle: 'automatic',
      values: ['25gm', '50gm', '100gm', '250gm', '500gm', '1000gm'],
    },
  ],
  variants: [],
  status: 'draft',
};

/** "100gm" / "1 kg" / "50 ml" -> grams. Mirrors the server's parseGrams. */
const parseGrams = (text) => {
  const match = /(\d+(?:\.\d+)?)\s*(kg|kgs|g|gm|gms|gram|grams|ml|l)\b/i.exec(String(text ?? ''));
  if (!match) return 0;
  const unit = match[2].toLowerCase();
  const grams = Number(match[1]) * (unit === 'kg' || unit === 'kgs' || unit === 'l' ? 1000 : 1);
  return Number.isFinite(grams) && grams > 0 ? grams : 0;
};

/**
 * Mirrors the server's resolveSizeGrams: an explicit fill size wins, otherwise
 * we read it off the Size option ("100gm" -> 100) and finally the label, so the
 * wizard shows the same bottle counts the API will enforce. This is the weight
 * removed from the perfume's shared stock per unit of this size sold.
 */
export const sizeGramsFor = (target) => {
  const explicit = Number(target?.sizeGrams);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const options = target?.options || {};
  const sizeOption = Object.entries(options).find(([key]) => /size|weight|fill|volume/i.test(key))?.[1];

  return parseGrams(sizeOption) || parseGrams(target?.label) || 1;
};

/**
 * The smallest fill this perfume can still be poured into — mirrors the server's
 * smallestFillGrams. It decides whether ANY unit is sellable out of the shared
 * weight, so it is the divisor behind every "units left" figure on screen.
 */
export const smallestFillGramsFor = (data) => {
  const variants = data?.variants || [];
  const active = variants.filter((v) => v?.isActive !== false);
  const sizes = (active.length ? active : variants).map((v) => sizeGramsFor(v));
  if (data?.hasVariants && sizes.length) return Math.min(...sizes);
  return sizeGramsFor(data);
};

/**
 * The perfume-level price the API and every listing still expect. Pricing is
 * entered per variant now, so with variants on this is the cheapest active row
 * (what a storefront shows as "from ..."); without them it is the single base
 * price typed on the variants step.
 */
export const basePricingFor = (data) => {
  const variants = data?.variants || [];
  const active = variants.filter((v) => v?.isActive !== false);
  const priced = (active.length ? active : variants).filter((v) => Number(v?.mrp) > 0);

  if (data?.hasVariants && priced.length) {
    const cheapest = priced.reduce((best, v) =>
      computeFinalPrice(v.mrp, v.discountPercent) < computeFinalPrice(best.mrp, best.discountPercent) ? v : best
    );
    return { mrp: Number(cheapest.mrp) || 0, discountPercent: Number(cheapest.discountPercent) || 0 };
  }

  return { mrp: Number(data?.mrp) || 0, discountPercent: Number(data?.discountPercent) || 0 };
};

export const computeFinalPrice = (mrp, discountPercent) => {
  const price = Number(mrp) || 0;
  const discount = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  return Math.round(price * (1 - discount / 100) * 100) / 100;
};
