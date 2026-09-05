import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const mediaSchema = z.object({
  url: z.string().url('Media must be a valid URL'),
  publicId: z.string().optional().default(''),
  alt: z.string().max(160).optional().default(''),
});

const faqSchema = z.object({
  question: z.string().trim().min(3, 'Question is too short').max(200),
  answer: z.string().trim().min(3, 'Answer is too short').max(2000),
});

const attributeSchema = z.object({
  name: z.string().trim().min(1, 'Attribute name is required').max(40),
  selectorStyle: z.enum(['automatic', 'chip', 'dropdown', 'swatch']).optional().default('automatic'),
  values: z.array(z.string().trim().min(1)).min(1, 'Add at least one value'),
});

const variantSchema = z.object({
  _id: objectId.optional(),
  label: z.string().trim().min(1, 'Variant label is required'),
  options: z.record(z.string()).optional().default({}),
  // Optional: left out, the server derives it from the perfume SKU and the
  // combination's options (AP-008 + { Size: 50gm } -> AP-008-50GM).
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .max(60)
    .refine((value) => !value || value.length >= 2, 'Variant SKU is too short')
    .optional()
    .default(''),
  mrp: z.coerce.number().min(0, 'Price cannot be negative'),
  discountPercent: z.coerce.number().min(0).max(100, 'Discount cannot exceed 100%').optional().default(0),
  // Derived from the Size option on save; accepted here so an odd fill can be set explicitly.
  sizeGrams: z.coerce.number().min(0, 'Fill size cannot be negative').optional(),
  isActive: z.boolean().optional().default(true),
  image: z
    .object({ url: z.string().optional().default(''), publicId: z.string().optional().default('') })
    .optional()
    .default({}),
  barcode: z.string().trim().optional().default(''),
  hsnCode: z.string().trim().optional().default(''),
})
  // Inventory lives on the perfume, never on a variant. An older client that
  // still posts `stock` per row is accepted, but the value is dropped.
  .strip();

const perfumeCore = {
  name: z.string().trim().min(2, 'Perfume name must be at least 2 characters').max(180),
  // Optional on purpose: a blank SKU means "number this one for me", and the
  // controller stamps the next one in the catalogue's run (AP-001, AP-002...).
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .max(60)
    .refine((value) => !value || value.length >= 2, 'SKU must be at least 2 characters')
    .refine((value) => !value || /^[A-Z0-9-_]+$/.test(value), 'Use letters, numbers, hyphens and underscores only')
    .optional()
    .default(''),
  brand: z.string().trim().max(80).optional().default(''),
  category: z.string().trim().max(80).optional().default(''),
  subCategory: z.string().trim().max(80).optional().default(''),
  fragranceFamily: z.string().trim().max(80).optional().default(''),
  concentration: z.string().trim().max(80).optional().default(''),
  shortDescription: z.string().trim().max(300).optional().default(''),
  description: z.string().trim().max(8000).optional().default(''),

  features: z.array(z.string().trim().min(1).max(200)).max(20, 'Up to 20 features').optional().default([]),
  faqs: z.array(faqSchema).max(20, 'Up to 20 FAQs').optional().default([]),

  mrp: z.coerce.number().min(0, 'Price cannot be negative'),
  discountPercent: z.coerce.number().min(0).max(100, 'Discount cannot exceed 100%').optional().default(0),
  // Stock is bulk weight in grams, so fractions of a gram are legitimate. This
  // is the perfume's ONE inventory figure — variants draw down the same pool.
  sizeGrams: z.coerce.number().min(0, 'Pack size cannot be negative').optional().default(0),
  stock: z.coerce.number().min(0, 'Stock cannot be negative').optional().default(0),
  lowStockThreshold: z.coerce.number().min(0).optional().default(100),

  images: z.array(mediaSchema).max(5, 'A perfume can have at most 5 images').optional().default([]),
  videos: z.array(mediaSchema).max(2, 'A perfume can have at most 2 videos').optional().default([]),

  hasVariants: z.boolean().optional().default(false),
  variantAttributes: z.array(attributeSchema).optional().default([]),
  variants: z.array(variantSchema).optional().default([]),

  status: z.enum(['draft', 'published', 'archived']).optional().default('draft'),
  hsnCode: z.string().trim().max(20).optional().default(''),
  barcode: z.string().trim().max(60).optional().default(''),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional().default([]),
};

/** Cross-field rules that a per-field schema cannot express. */
const variantConsistency = (data, ctx) => {
  if (!data.hasVariants) return;

  if (!data.variantAttributes?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['variantAttributes'],
      message: 'Add at least one attribute (for example Size) before generating combinations',
    });
  }

  if (!data.variants?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['variants'],
      message: 'Generate at least one variant combination, or turn variants off',
    });
    return;
  }

  const seen = new Set();
  data.variants.forEach((variant, index) => {
    const sku = variant.sku?.toUpperCase();
    if (!sku) return; // derived on save, so there is nothing to collide with yet
    if (seen.has(sku)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants', index, 'sku'],
        message: `Duplicate variant SKU "${sku}" — each combination needs its own SKU`,
      });
    }
    seen.add(sku);
  });

  if (!data.variants.some((v) => v.isActive)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['variants'],
      message: 'At least one variant must stay active',
    });
  }
};

/** A published perfume needs enough content to actually be sold. */
const publishReadiness = (data, ctx) => {
  if (data.status !== 'published') return;
  if (!data.images?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['images'],
      message: 'Add at least one perfume image before publishing',
    });
  }
  if (!Number(data.mrp)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mrp'], message: 'Set a price before publishing' });
  }
};

export const createPerfumeSchema = z
  .object(perfumeCore)
  .superRefine((data, ctx) => {
    variantConsistency(data, ctx);
    publishReadiness(data, ctx);
  });

export const updatePerfumeSchema = z
  .object(perfumeCore)
  .partial()
  .superRefine((data, ctx) => {
    if (data.hasVariants !== undefined) variantConsistency(data, ctx);
    if (data.status) publishReadiness(data, ctx);
  });

export const listPerfumeQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().trim().max(100, 'Search term is too long').optional().default(''),
  category: z.string().trim().optional().default(''),
  subCategory: z.string().trim().optional().default(''),
  status: z.enum(['all', 'draft', 'published', 'archived']).optional().default('all'),
  stock: z.enum(['all', 'in', 'low', 'out']).optional().default('all'),
  sort: z.string().optional().default('-createdAt'),
});

export const lookupQuerySchema = z.object({
  q: z.string().trim().optional().default(''),
  limit: z.coerce.number().int().min(1).max(50).optional().default(15),
});

export const statusBodySchema = z.object({ status: z.enum(['draft', 'published', 'archived']) });

export const stockBodySchema = z.object({
  /**
   * Grams on hand after the correction, not a bottle count. There is no
   * variantSku here on purpose: a perfume has exactly one stock figure.
   */
  stock: z.coerce.number().min(0, 'Stock cannot be negative'),
  /** Optional — lets the same inline editor retune the alert weight. */
  lowStockThreshold: z.coerce.number().min(0).optional(),
});

export const idParamSchema = z.object({ id: objectId });
