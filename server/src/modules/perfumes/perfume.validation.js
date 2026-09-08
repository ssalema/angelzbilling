import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

/** Ceiling on any single stock movement — 10,000 kg, in grams. */
const MAX_STOCK_GRAMS = 10_000_000;

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
  stock: z.enum(['all', 'in', 'low', 'out', 'restock']).optional().default('all'),
  sort: z.string().optional().default('-createdAt'),
});

export const lookupQuerySchema = z.object({
  q: z.string().trim().optional().default(''),
  limit: z.coerce.number().int().min(1).max(50).optional().default(15),
});

export const statusBodySchema = z.object({ status: z.enum(['draft', 'published', 'archived']) });

/** Grams, with a sane ceiling — a stock line is weight, not a mistyped barcode. */
// The min/max also fence off Infinity, which `z.number()` alone lets through.
const gramsDelta = z.coerce
  .number()
  .min(-MAX_STOCK_GRAMS, 'That much stock cannot be removed at once')
  .max(MAX_STOCK_GRAMS, 'That is more stock than one update can add');

export const stockBodySchema = z
  .object({
    /**
     * Grams on hand after the correction, not a bottle count. There is no
     * variantSku here on purpose: a perfume has exactly one stock figure.
     */
    stock: z.coerce.number().min(0, 'Stock cannot be negative').optional(),
    /**
     * Grams arriving, added to whatever is on hand. The stock update screen
     * sends this rather than a total it worked out itself, so a bottle sold
     * while the admin was typing is not quietly written back over.
     */
    addStock: gramsDelta.optional(),
    /** Optional — lets the same inline editor retune the alert weight. */
    lowStockThreshold: z.coerce.number().min(0).optional(),
  })
  .refine((data) => data.stock !== undefined || data.addStock !== undefined, {
    path: ['stock'],
    message: 'Send either a new stock total or the grams to add',
  });

/**
 * The stock screen's type-ahead. With no term it answers with the perfumes that
 * actually need restocking, so the box is useful before anything is typed.
 */
export const stockSearchQuerySchema = z.object({
  q: z.string().trim().max(100, 'Search term is too long').optional().default(''),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

/**
 * One request matches every row of an uploaded sheet against the catalogue.
 * The cap is the sheet size the bulk screen accepts — comfortably inside the
 * 2mb body limit, and far more than a restock run ever carries.
 */
export const MAX_BULK_STOCK_ROWS = 2000;

export const resolveStockNamesSchema = z.object({
  names: z
    .array(z.string().trim().min(1).max(180))
    .min(1, 'Nothing to match')
    .max(MAX_BULK_STOCK_ROWS, `Up to ${MAX_BULK_STOCK_ROWS} rows can be matched at once`),
});

export const bulkStockSchema = z.object({
  items: z
    .array(z.object({ id: objectId, addStock: gramsDelta }))
    .min(1, 'Nothing to update')
    .max(MAX_BULK_STOCK_ROWS, `Up to ${MAX_BULK_STOCK_ROWS} perfumes can be updated at once`),
});

export const idParamSchema = z.object({ id: objectId });

/* ───────────────────────── Per-size repricing ─────────────────────────
 * The repricing screen sends one price per fill the admin actually changed.
 * A size absent from `prices` is a size that keeps what it has — the server
 * derives nothing, so nothing can be rewritten by accident.
 */

/** Mirrors MIN/MAX_PRICE in utils/sizePricing.js. */
const sizePrice = z.coerce
  .number()
  // No currency symbol: the symbol is a store setting and this schema is built
  // once at import time, long before any settings document is read.
  .min(1, 'Price must be at least 1')
  .max(10_000_000, 'That price is far higher than any perfume in the catalogue');

/** The repricing screen's type-ahead — the same shape as the stock one. */
export const priceSearchQuerySchema = z.object({
  q: z.string().trim().max(100, 'Search term is too long').optional().default(''),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

/**
 * One request matches every row of an uploaded sheet against the catalogue.
 * The cap is the sheet size the bulk screen accepts — comfortably inside the
 * 2mb body limit, and larger than the catalogue itself.
 */
export const MAX_BULK_PRICE_ROWS = 2000;

export const resolvePriceNamesSchema = z.object({
  names: z
    .array(z.string().trim().min(1).max(180))
    .min(1, 'Nothing to match')
    .max(MAX_BULK_PRICE_ROWS, `Up to ${MAX_BULK_PRICE_ROWS} rows can be matched at once`),
});

export const bulkPriceSchema = z.object({
  items: z
    .array(
      z.object({
        id: objectId,
        /** Only the fills being changed; grams identify which variant they land on. */
        prices: z
          .array(
            z.object({
              sizeGrams: z.coerce.number().positive('A fill size must be above zero grams'),
              mrp: sizePrice,
            })
          )
          .min(1, 'Give a price for at least one size')
          .max(40, 'A perfume cannot have this many sizes repriced at once'),
      })
    )
    .min(1, 'Nothing to update')
    .max(MAX_BULK_PRICE_ROWS, `Up to ${MAX_BULK_PRICE_ROWS} perfumes can be repriced at once`),
});

/* ───────────────────────── Bulk catalogue upload ─────────────────────────
 * Creating perfumes from a spreadsheet. The sheet itself is read in the
 * browser; what arrives here is one object per perfume the admin reviewed.
 *
 * SKUs are deliberately absent: the whole point of the screen is that the
 * catalogue numbers its own new rows, so a client-supplied SKU is not accepted
 * even if one is sent.
 *
 * `prices` carries only the fills the sheet actually filled in. A size left out
 * is a size this perfume does not sell — nothing is derived from a neighbouring
 * price, here or anywhere else (see utils/sizePricing.js).
 */

/** A sheet this long is a catalogue import, not a typo — and still one request. */
export const MAX_BULK_CREATE_ROWS = 2000;

export const previewBulkCreateSchema = z.object({
  names: z
    .array(z.string().trim().min(1).max(180))
    .min(1, 'Nothing to check')
    .max(MAX_BULK_CREATE_ROWS, `Up to ${MAX_BULK_CREATE_ROWS} perfumes can be uploaded at once`),
});

const bulkCreateItem = z.object({
  name: z.string().trim().min(2, 'Perfume name must be at least 2 characters').max(180),
  category: z.string().trim().max(80).optional().default(''),
  brand: z.string().trim().max(80).optional().default(''),
  /** Bulk weight in grams — the one inventory figure a perfume carries. */
  stock: z.coerce
    .number()
    .min(0, 'Stock cannot be negative')
    .max(MAX_STOCK_GRAMS, 'That is more stock than one upload can add')
    .optional()
    .default(0),
  /**
   * The photograph, already uploaded from the review screen — the spreadsheet
   * never carries one, so this is a media-library link and not a sheet cell.
   *
   * Empty is allowed and means "no photo": that row is created as a draft
   * rather than rejected, since a perfume cannot be published without an image
   * and the admin may well be photographing the shelf afterwards.
   */
  image: z
    .union([
      z.literal(''),
      z
        .string()
        .trim()
        .url('The photo must be a link starting with http')
        .max(2000)
        // `url()` alone accepts any scheme, so "C:\photos\zumar.jpg" parses as a
        // "c:" URL and would be stored as an image the catalogue can never load.
        .refine((value) => /^https?:\/\//i.test(value), 'A photo must be an http:// or https:// link'),
    ])
    .optional()
    .default(''),
  /**
   * The Cloudinary id behind that photo, so the perfume owns its upload: it is
   * cleaned up with the perfume, exactly as an image added in the wizard is.
   */
  imagePublicId: z.string().trim().max(300).optional().default(''),
  prices: z
    .array(z.object({ sizeGrams: z.coerce.number().positive('A fill size must be above zero grams'), mrp: sizePrice }))
    .min(1, 'Give a price for at least one size')
    .max(40, 'A perfume cannot be created with this many sizes'),
});

export const bulkCreateSchema = z.object({
  items: z
    .array(bulkCreateItem)
    .min(1, 'Nothing to create')
    .max(MAX_BULK_CREATE_ROWS, `Up to ${MAX_BULK_CREATE_ROWS} perfumes can be created at once`),
});
