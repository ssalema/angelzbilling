import mongoose from 'mongoose';
import Perfume from '../../models/Perfume.js';
import Bill from '../../models/Bill.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/ApiResponse.js';
import { getPagination, getSort, escapeRegex, round2 } from '../../utils/query.js';
import { destroyAsset } from '../../config/cloudinary.js';
import { resolveSizeGrams, unitsFromGrams, smallestFillGrams } from '../../utils/grams.js';
import { generateSku, getSkuPrefix } from './perfume.service.js';

const SORTABLE = ['createdAt', 'name', 'mrp', 'finalPrice', 'stock', 'status'];

/**
 * Adds the derived numbers the list view needs to lean (non-hydrated) docs.
 *
 * A perfume holds ONE bulk weight in `stock`, shared by every fill size, so
 * `totalStock` is that figure verbatim. `unitsInStock` turns it into bottles
 * at the smallest active fill — the best case, and the honest answer to "is
 * there still enough weight to sell anything?".
 */
const decorate = (perfume) => {
  const totalStock = perfume.stock || 0;
  const fillGrams = smallestFillGrams(perfume);
  const unitsInStock = unitsFromGrams(totalStock, fillGrams);

  const variantPrices = (perfume.variants || []).map((v) => v.sellingPrice ?? 0).filter((n) => n > 0);

  return {
    ...perfume,
    id: perfume._id,
    totalStock,
    unitsInStock,
    // The fill `unitsInStock` was measured at, so the UI can label it.
    smallestFillGrams: fillGrams,
    isLowStock: totalStock <= (perfume.lowStockThreshold ?? 100),
    isOutOfStock: totalStock === 0,
    primaryImage: perfume.images?.[0]?.url || perfume.variants?.find((v) => v.image?.url)?.image?.url || '',
    variantCount: perfume.variants?.length || 0,
    priceFrom: variantPrices.length ? Math.min(...variantPrices) : perfume.finalPrice,
    priceTo: variantPrices.length ? Math.max(...variantPrices) : perfume.finalPrice,
  };
};

export const listPerfumes = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { search, category, subCategory, status, stock, sort } = req.query;

  const filter = {};
  if (status !== 'all') filter.status = status;
  if (category) filter.category = category;
  if (subCategory) filter.subCategory = subCategory;

  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { sku: rx }, { brand: rx }, { 'variants.sku': rx }, { tags: rx }];
  }

  // Stock filters work on the perfume's single grams-on-hand figure, and "low"
  // is measured against each perfume's own threshold, not one hard-coded number.
  if (stock !== 'all') {
    const gramsOnHand = { $ifNull: ['$stock', 0] };
    const threshold = { $ifNull: ['$lowStockThreshold', 100] };

    if (stock === 'out') filter.$expr = { $lte: [gramsOnHand, 0] };
    if (stock === 'low') {
      filter.$expr = { $and: [{ $gt: [gramsOnHand, 0] }, { $lte: [gramsOnHand, threshold] }] };
    }
    if (stock === 'in') filter.$expr = { $gt: [gramsOnHand, threshold] };
  }

  const [items, total] = await Promise.all([
    Perfume.find(filter).sort(getSort(sort, SORTABLE)).skip(skip).limit(limit).lean(),
    Perfume.countDocuments(filter),
  ]);

  return sendPaginated(res, {
    message: 'Perfumes loaded',
    items: items.map(decorate),
    page,
    limit,
    total,
  });
});

/** Distinct values that feed the category / brand filter dropdowns. */
export const getPerfumeFacets = asyncHandler(async (req, res) => {
  const [categories, subCategories, brands, counts] = await Promise.all([
    Perfume.distinct('category', { category: { $nin: ['', null] } }),
    Perfume.distinct('subCategory', { subCategory: { $nin: ['', null] } }),
    Perfume.distinct('brand', { brand: { $nin: ['', null] } }),
    Perfume.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  return sendSuccess(res, {
    message: 'Filters loaded',
    data: {
      categories: categories.sort(),
      subCategories: subCategories.sort(),
      brands: brands.sort(),
      statusCounts: Object.fromEntries(counts.map((c) => [c._id, c.count])),
    },
  });
});

/** Lightweight type-ahead for the billing screen — one row per sellable SKU. */
export const lookupPerfumes = asyncHandler(async (req, res) => {
  const { q, limit } = req.query;

  const filter = { status: 'published' };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { sku: rx }, { brand: rx }, { 'variants.sku': rx }];
  }

  const perfumes = await Perfume.find(filter)
    .select('name sku brand mrp discountPercent finalPrice stock sizeGrams hasVariants variants images hsnCode')
    .sort({ name: 1 })
    .limit(limit)
    .lean();

  const options = [];
  perfumes.forEach((perfume) => {
    const image = perfume.images?.[0]?.url || '';
    if (perfume.hasVariants && perfume.variants?.length) {
      perfume.variants
        .filter((v) => v.isActive)
        .forEach((variant) => {
          options.push({
            perfumeId: perfume._id,
            variantId: variant._id,
            name: perfume.name,
            brand: perfume.brand,
            label: `${perfume.name} — ${variant.label}`,
            sku: perfume.sku,
            variantSku: variant.sku,
            variantLabel: variant.label,
            mrp: variant.mrp,
            discountPercent: variant.discountPercent,
            unitPrice: variant.sellingPrice,
            // The perfume's shared grams plus this fill size, so the billing
            // screen can cap quantity at what the weight actually covers. Every
            // variant of a perfume reports the same `stock` — it is one pool.
            stock: perfume.stock || 0,
            sizeGrams: resolveSizeGrams(variant),
            unitsAvailable: unitsFromGrams(perfume.stock, resolveSizeGrams(variant)),
            image: variant.image?.url || image,
            hsnCode: variant.hsnCode || perfume.hsnCode || '',
          });
        });
    } else {
      options.push({
        perfumeId: perfume._id,
        variantId: null,
        name: perfume.name,
        brand: perfume.brand,
        label: perfume.name,
        sku: perfume.sku,
        variantSku: '',
        variantLabel: '',
        mrp: perfume.mrp,
        discountPercent: perfume.discountPercent,
        unitPrice: perfume.finalPrice,
        stock: perfume.stock,
        sizeGrams: resolveSizeGrams(perfume),
        unitsAvailable: unitsFromGrams(perfume.stock, resolveSizeGrams(perfume)),
        image,
        hsnCode: perfume.hsnCode || '',
      });
    }
  });

  return sendSuccess(res, { message: 'Perfumes loaded', data: options });
});

export const getPerfume = asyncHandler(async (req, res) => {
  const perfume = await Perfume.findById(req.params.id)
    .populate('createdBy', 'name email')
    .populate('updatedBy', 'name email')
    .lean();

  if (!perfume) throw ApiError.notFound('Perfume not found');

  // Sales figures shown on the perfume view page, split per fill size so a
  // bare "3 units" can't hide three 50gm testers behind one 200gm bottle.
  const soldRows = await Bill.aggregate([
    { $match: { status: 'paid' } },
    { $unwind: '$items' },
    { $match: { 'items.perfume': new mongoose.Types.ObjectId(String(perfume._id)) } },
    {
      $group: {
        _id: '$items.variantId',
        unitsSold: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.lineTotal' },
        label: { $last: '$items.variantLabel' },
        sizeGrams: { $last: '$items.sizeGrams' },
      },
    },
    { $sort: { sizeGrams: 1 } },
  ]);

  // Prefer the perfume's current label — a size renamed after the sale should
  // read the way the rest of the page reads.
  const variantById = new Map((perfume.variants || []).map((v) => [String(v._id), v]));

  const bySize = soldRows.map((row) => {
    const variant = row._id ? variantById.get(String(row._id)) : null;
    return {
      variantId: row._id ? String(row._id) : null,
      label: variant?.label || row.label || (row.sizeGrams ? `${row.sizeGrams}gm` : 'Base size'),
      sizeGrams: variant?.sizeGrams || row.sizeGrams || 0,
      unitsSold: row.unitsSold || 0,
      revenue: round2(row.revenue || 0),
    };
  });

  return sendSuccess(res, {
    message: 'Perfume loaded',
    data: {
      ...decorate(perfume),
      sales: {
        unitsSold: bySize.reduce((sum, row) => sum + row.unitsSold, 0),
        revenue: round2(bySize.reduce((sum, row) => sum + row.revenue, 0)),
        bySize,
      },
    },
  });
});

const assertSkusAreFree = async (payload, excludeId = null) => {
  const skus = [payload.sku, ...(payload.variants || []).map((v) => v.sku)].filter(Boolean).map(String);
  const clash = await Perfume.findOne({
    _id: excludeId ? { $ne: excludeId } : { $exists: true },
    $or: [{ sku: { $in: skus } }, { 'variants.sku': { $in: skus } }],
  })
    .select('name sku variants.sku')
    .lean();

  if (clash) {
    const taken =
      skus.find((s) => s === clash.sku) ||
      skus.find((s) => (clash.variants || []).some((v) => v.sku === s)) ||
      'SKU';
    throw ApiError.conflict(`SKU "${taken}" is already used by "${clash.name}"`, [
      { field: 'sku', message: 'This SKU is already in use' },
    ]);
  }
};

/** "AP-008" + { Size: '50gm' } -> "AP-008-50GM". Mirrors the wizard's skuFor. */
const variantSkuFrom = (baseSku, variant, index) => {
  const suffix = Object.values(variant.options || {})
    .map((value) => String(value).toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .filter(Boolean)
    .join('-');
  return `${baseSku}-${suffix || index + 1}`;
};

/**
 * Fills in whatever the client left blank: the perfume's own SKU when it is
 * empty, then any variant SKU, so every row is numbered off the same base.
 */
const stampSkus = async (payload) => {
  const sku = payload.sku || (await generateSku());
  const variants = (payload.variants || []).map((variant, index) => ({
    ...variant,
    sku: variant.sku || variantSkuFrom(sku, variant, index),
  }));
  return { ...payload, sku, variants };
};

/** The number the wizard shows in a new perfume's SKU box before it is saved. */
export const getNextSku = asyncHandler(async (req, res) => {
  const prefix = await getSkuPrefix();
  const sku = await generateSku(prefix);
  return sendSuccess(res, { message: 'SKU generated', data: { sku, prefix } });
});

export const createPerfume = asyncHandler(async (req, res) => {
  const autoNumbered = !req.body.sku;
  let payload = await stampSkus(req.body);

  // Two admins can hit Save in the same second and be handed the same number.
  // A SKU the admin typed is their own to fix; one we generated, we re-roll.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await assertSkusAreFree(payload);
      break;
    } catch (error) {
      if (!autoNumbered || attempt >= 4 || error.statusCode !== 409) throw error;
      payload = await stampSkus({ ...req.body, variants: req.body.variants });
    }
  }

  const perfume = await Perfume.create({
    ...payload,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  return sendCreated(res, {
    message:
      perfume.status === 'published'
        ? `"${perfume.name}" is now published`
        : `"${perfume.name}" saved as a draft`,
    data: decorate(perfume.toObject()),
  });
});

export const updatePerfume = asyncHandler(async (req, res) => {
  const perfume = await Perfume.findById(req.params.id);
  if (!perfume) throw ApiError.notFound('Perfume not found');

  // A perfume that already exists keeps its number: an empty SKU here means
  // "unchanged", never "renumber me". Blank variant SKUs are still derived.
  if (!req.body.sku) delete req.body.sku;
  if (Array.isArray(req.body.variants)) {
    req.body.variants = req.body.variants.map((variant, index) => ({
      ...variant,
      sku: variant.sku || variantSkuFrom(perfume.sku, variant, index),
    }));
  }

  await assertSkusAreFree({ ...perfume.toObject(), ...req.body }, perfume._id);

  // Media removed in the editor should not linger in Cloudinary.
  if (Array.isArray(req.body.images)) {
    const keep = new Set(req.body.images.map((i) => i.publicId).filter(Boolean));
    const orphaned = perfume.images.filter((i) => i.publicId && !keep.has(i.publicId));
    await Promise.all(orphaned.map((i) => destroyAsset(i.publicId, 'image')));
  }
  if (Array.isArray(req.body.videos)) {
    const keep = new Set(req.body.videos.map((i) => i.publicId).filter(Boolean));
    const orphaned = perfume.videos.filter((i) => i.publicId && !keep.has(i.publicId));
    await Promise.all(orphaned.map((i) => destroyAsset(i.publicId, 'video')));
  }

  Object.assign(perfume, req.body, { updatedBy: req.user._id });
  await perfume.save();

  return sendSuccess(res, { message: `"${perfume.name}" updated`, data: decorate(perfume.toObject()) });
});

export const updatePerfumeStatus = asyncHandler(async (req, res) => {
  const perfume = await Perfume.findById(req.params.id);
  if (!perfume) throw ApiError.notFound('Perfume not found');

  if (req.body.status === 'published' && !perfume.images?.length) {
    throw ApiError.badRequest('Add at least one perfume image before publishing');
  }

  perfume.status = req.body.status;
  perfume.updatedBy = req.user._id;
  await perfume.save();

  return sendSuccess(res, {
    message: `"${perfume.name}" is now ${perfume.status}`,
    data: decorate(perfume.toObject()),
  });
});

/**
 * Quick inline stock correction from the perfumes table — the value is grams.
 * There is nothing to choose between: a perfume has one bulk weight, and every
 * variant is poured from it, so the correction always lands on the perfume.
 */
export const adjustStock = asyncHandler(async (req, res) => {
  const perfume = await Perfume.findById(req.params.id);
  if (!perfume) throw ApiError.notFound('Perfume not found');

  perfume.stock = req.body.stock;
  if (req.body.lowStockThreshold !== undefined) {
    perfume.lowStockThreshold = req.body.lowStockThreshold;
  }

  perfume.updatedBy = req.user._id;
  await perfume.save();

  return sendSuccess(res, { message: 'Stock updated', data: decorate(perfume.toObject()) });
});

export const deletePerfume = asyncHandler(async (req, res) => {
  const perfume = await Perfume.findById(req.params.id);
  if (!perfume) throw ApiError.notFound('Perfume not found');

  // A perfume referenced by a bill must never vanish — archive it instead.
  const billed = await Bill.countDocuments({ 'items.perfume': perfume._id });
  if (billed > 0) {
    perfume.status = 'archived';
    perfume.updatedBy = req.user._id;
    await perfume.save();
    return sendSuccess(res, {
      message: `"${perfume.name}" appears on ${billed} bill(s), so it has been archived instead of deleted. Your bill history stays intact.`,
      data: decorate(perfume.toObject()),
    });
  }

  await Promise.all([
    ...perfume.images.filter((i) => i.publicId).map((i) => destroyAsset(i.publicId, 'image')),
    ...perfume.videos.filter((i) => i.publicId).map((i) => destroyAsset(i.publicId, 'video')),
    ...perfume.variants
      .filter((v) => v.image?.publicId)
      .map((v) => destroyAsset(v.image.publicId, 'image')),
  ]);

  await perfume.deleteOne();
  return sendSuccess(res, { message: `"${perfume.name}" deleted` });
});
