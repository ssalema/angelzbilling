import mongoose from 'mongoose';
import slugify from 'slugify';
import { resolveSizeGrams, unitsFromGrams, smallestFillGrams } from '../utils/grams.js';

const PERFUME_STATUSES = ['draft', 'published', 'archived'];

export const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export const computeFinalPrice = (mrp = 0, discountPercent = 0) =>
  round2(Number(mrp || 0) * (1 - Math.min(100, Math.max(0, Number(discountPercent || 0))) / 100));

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, default: '', trim: true },
    alt: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const faqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 200 },
    answer: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { _id: false }
);

const attributeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 }, // e.g. "Size"
    selectorStyle: { type: String, enum: ['automatic', 'chip', 'dropdown', 'swatch'], default: 'automatic' },
    values: {
      type: [String],
      default: [],
      validate: [(v) => v.length > 0, 'An attribute needs at least one value'],
    },
  },
  { _id: false }
);

const variantSchema = new mongoose.Schema(
  {
    /** Human label built from the options, e.g. "100gm" or "100gm / Gold". */
    label: { type: String, required: true, trim: true },
    /** { Size: '100gm', Finish: 'Gold' } — flexible so any attribute set works. */
    options: { type: Map, of: String, default: {} },
    sku: { type: String, required: true, trim: true, uppercase: true },
    mrp: { type: Number, required: true, min: [0, 'Price cannot be negative'] },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    sellingPrice: { type: Number, default: 0, min: 0 },
    /**
     * Grams this fill removes from the perfume's single stock per unit sold —
     * derived from the Size option on save. A variant deliberately holds NO
     * stock of its own: every size is poured from the same bulk weight kept on
     * the parent perfume, so a variant only carries size, price and SKU.
     */
    sizeGrams: { type: Number, default: 0, min: [0, 'Fill size cannot be negative'] },
    isActive: { type: Boolean, default: true },
    image: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    barcode: { type: String, default: '', trim: true },
    hsnCode: { type: String, default: '', trim: true },
  },
  { _id: true }
);

const perfumeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Perfume name is required'],
      trim: true,
      maxlength: [180, 'Perfume name cannot exceed 180 characters'],
    },
    slug: { type: String, trim: true, lowercase: true, index: true },
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      trim: true,
      uppercase: true,
      unique: true,
    },
    brand: { type: String, trim: true, default: '', maxlength: 80 },
    category: { type: String, trim: true, default: '', maxlength: 80 },
    subCategory: { type: String, trim: true, default: '', maxlength: 80 },
    fragranceFamily: { type: String, trim: true, default: '' }, // Floral, Woody, Oriental...
    concentration: { type: String, trim: true, default: '' }, // Attar, EDP, EDT...
    shortDescription: { type: String, trim: true, default: '', maxlength: 300 },
    description: { type: String, trim: true, default: '', maxlength: 8000 },

    features: { type: [String], default: [] },
    faqs: { type: [faqSchema], default: [] },

    // ── Base pricing (used when the perfume has no variants) ──
    mrp: { type: Number, required: [true, 'Price is required'], min: [0, 'Price cannot be negative'] },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    finalPrice: { type: Number, default: 0, min: 0, index: true },

    /** Grams sold per unit when the perfume has no variants (its pack size). */
    sizeGrams: { type: Number, default: 0, min: [0, 'Pack size cannot be negative'] },
    /**
     * THE inventory for this perfume, in GRAMS — one bulk pool every fill size
     * is poured from, whether or not it has variants. Selling a 50gm variant
     * takes 50 g out of here; nothing else in this schema holds stock.
     */
    stock: { type: Number, default: 0, min: [0, 'Stock cannot be negative'] },
    /** Also grams — the weight at which the low stock alert fires, measured on `stock`. */
    lowStockThreshold: { type: Number, default: 100, min: 0 },

    images: {
      type: [mediaSchema],
      default: [],
      validate: [(v) => v.length <= 5, 'A perfume can have at most 5 images'],
    },
    videos: {
      type: [mediaSchema],
      default: [],
      validate: [(v) => v.length <= 2, 'A perfume can have at most 2 videos'],
    },

    hasVariants: { type: Boolean, default: false },
    variantAttributes: { type: [attributeSchema], default: [] },
    variants: { type: [variantSchema], default: [] },

    status: { type: String, enum: PERFUME_STATUSES, default: 'draft', index: true },
    hsnCode: { type: String, trim: true, default: '' },
    barcode: { type: String, trim: true, default: '' },
    tags: { type: [String], default: [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    // Pinned: the model is Perfume but the data still lives in the original collection.
    collection: 'products',
  }
);

perfumeSchema.index({ status: 1, createdAt: -1 });
perfumeSchema.index({ category: 1, subCategory: 1 });
perfumeSchema.index({ 'variants.sku': 1 });
/**
 * The billing screen's type-ahead filters on `status: 'published'` and sorts by
 * name — the hottest read in the app, since it fires while a biller types. This
 * compound serves the filter and the sort from one index scan.
 *
 * It also covers the plain `name` sort on the catalogue list. A text index
 * cannot serve a sort, so the one below does not help here despite covering the
 * same field.
 */
perfumeSchema.index({ status: 1, name: 1 });
/**
 * The remaining sortable columns on the catalogue list. Without these, sorting
 * by price or stock pulled the whole matching set into memory to sort it, which
 * Mongo refuses to do past 32 MB.
 */
perfumeSchema.index({ name: 1 });
perfumeSchema.index({ mrp: -1 });
perfumeSchema.index({ stock: 1 });
perfumeSchema.index({ name: 'text', brand: 'text', sku: 'text', tags: 'text' });

/** Grams on hand. Variants share this one pool, so it is simply `stock`. */
perfumeSchema.virtual('totalStock').get(function totalStock() {
  return this.stock || 0;
});

perfumeSchema.virtual('isLowStock').get(function isLowStock() {
  return this.totalStock <= (this.lowStockThreshold ?? 100);
});

perfumeSchema.virtual('primaryImage').get(function primaryImage() {
  return this.images?.[0]?.url || this.variants?.find((v) => v.image?.url)?.image?.url || '';
});

/**
 * Keep every derived field in sync on write, so reads never have to compute.
 * This is what lets the perfume list sort and filter by real selling price.
 */
perfumeSchema.pre('save', function syncDerived(next) {
  if (this.isModified('name') && this.name) {
    this.slug = slugify(this.name, { lower: true, strict: true, trim: true });
  }

  this.finalPrice = computeFinalPrice(this.mrp, this.discountPercent);

  if (this.hasVariants && this.variants?.length) {
    this.variants.forEach((variant) => {
      variant.sellingPrice = computeFinalPrice(variant.mrp, variant.discountPercent);
      // "100gm" in the Size option is the source of truth unless someone typed an
      // explicit fill size, so stock maths never depends on a hidden field.
      variant.sizeGrams = resolveSizeGrams(variant);
    });
  } else {
    // A perfume toggled back to "no variants" must not keep stale variant rows.
    this.hasVariants = false;
    this.variants = [];
    this.variantAttributes = [];
    this.sizeGrams = resolveSizeGrams(this);
  }

  next();
});

/**
 * Whole bottles sellable right now out of the shared weight. With variants the
 * answer depends on which fill you pour, so we report the best case — the
 * smallest active fill — which is what "can this still be sold at all?" means.
 */
perfumeSchema.virtual('unitsInStock').get(function unitsInStock() {
  return unitsFromGrams(this.stock, smallestFillGrams(this));
});

perfumeSchema.methods.findVariantBySku = function findVariantBySku(sku) {
  if (!sku) return null;
  return this.variants.find((v) => v.sku?.toUpperCase() === String(sku).toUpperCase()) || null;
};

export const Perfume = mongoose.model('Perfume', perfumeSchema);
export default Perfume;
