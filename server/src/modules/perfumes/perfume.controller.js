import mongoose from 'mongoose';
import slugify from 'slugify';
import Perfume, { computeFinalPrice } from '../../models/Perfume.js';
import Bill from '../../models/Bill.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/ApiResponse.js';
import { getPagination, getSort, escapeRegex, round2 } from '../../utils/query.js';
import { destroyAsset } from '../../config/cloudinary.js';
import { resolveSizeGrams, unitsFromGrams, smallestFillGrams, formatGrams } from '../../utils/grams.js';
import { pricesBySize } from '../../utils/sizePricing.js';
import { generateSku, generateSkuBlock, getSkuPrefix } from './perfume.service.js';
import { lookupCache } from '../../middlewares/cache.js';

const SORTABLE = ['createdAt', 'name', 'mrp', 'finalPrice', 'stock', 'status'];

// Adds the derived fields the list view needs to lean docs.
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

const buildPerfumeSearch = (search) => {
  const term = String(search || '').trim();
  if (!term) return {};

  // A term like "AP-OUD-100" is a SKU, so search SKUs instead of names.
  if (/^[A-Za-z0-9][A-Za-z0-9_-]{2,}$/.test(term) && /\d/.test(term)) {
    const prefix = new RegExp(`^${escapeRegex(term.toUpperCase())}`);
    return { $or: [{ sku: prefix }, { 'variants.sku': prefix }] };
  }

  const rx = new RegExp(escapeRegex(term), 'i');
  return { $or: [{ name: rx }, { brand: rx }, { tags: rx }] };
};

export const listPerfumes = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { search, category, subCategory, status, stock, sort } = req.query;

  const filter = {};
  if (status !== 'all') filter.status = status;
  if (category) filter.category = category;
  if (subCategory) filter.subCategory = subCategory;

  if (search) Object.assign(filter, buildPerfumeSearch(search));

  if (stock !== 'all') {
    if (stock === 'out') filter.stock = { $lte: 0 };
    // Low = still in stock but at or under the threshold.
    if (stock === 'low') Object.assign(filter, { stock: { $gt: 0 }, stockMargin: { $lte: 0 } });
    if (stock === 'in') filter.stockMargin = { $gt: 0 };
    // Low + out of stock, matching the dashboard's restock alert panel.
    if (stock === 'restock') filter.stockMargin = { $lte: 0 };
  }

  const LIST_FIELDS =
    'name sku brand category subCategory mrp discountPercent finalPrice stock lowStockThreshold ' +
    'sizeGrams hasVariants status createdAt images.url ' +
    'variants.sellingPrice variants.sizeGrams variants.label variants.options variants.isActive variants.image.url';

  const [items, total] = await Promise.all([
    Perfume.find(filter).select(LIST_FIELDS).sort(getSort(sort, SORTABLE)).skip(skip).limit(limit).lean(),
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


const LOOKUP_FIELDS =
  'name sku brand mrp discountPercent finalPrice sizeGrams hasVariants hsnCode images.url ' +
  'variants.sku variants.label variants.options variants.isActive variants.mrp ' +
  'variants.discountPercent variants.sellingPrice variants.sizeGrams variants.image.url variants.hsnCode';

// Above this many perfumes, lookups query the DB instead of caching in memory.
const LOOKUP_MAX_PERFUMES = 3000;
const LOOKUP_KEY = 'published-options';

/** One sellable row. `haystack` is what the in-memory filter matches on. */
const optionRow = (perfume, variant) => {
  const image = perfume.images?.[0]?.url || '';
  const sizeGrams = resolveSizeGrams(variant || perfume);

  return {
    perfumeId: perfume._id,
    variantId: variant?._id || null,
    name: perfume.name,
    brand: perfume.brand,
    label: variant ? `${perfume.name} — ${variant.label}` : perfume.name,
    sku: perfume.sku,
    variantSku: variant?.sku || '',
    variantLabel: variant?.label || '',
    mrp: variant ? variant.mrp : perfume.mrp,
    discountPercent: variant ? variant.discountPercent : perfume.discountPercent,
    unitPrice: variant ? variant.sellingPrice : perfume.finalPrice,
    sizeGrams,
    image: variant?.image?.url || image,
    hsnCode: variant?.hsnCode || perfume.hsnCode || '',
    // Lowercased once so filtering does no per-keystroke casing.
    haystack: [perfume.name, perfume.sku, perfume.brand, variant?.sku, variant?.label]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  };
};

// All sellable rows, cached until a catalogue write clears the cache.
const publishedOptions = async () => {
  const cached = lookupCache.get(LOOKUP_KEY);
  if (cached) return cached.tooLarge ? null : cached.rows;

  const perfumes = await Perfume.find({ status: 'published' })
    .select(LOOKUP_FIELDS)
    .sort({ name: 1 })
    // Fetch one extra to detect the limit without a second count.
    .limit(LOOKUP_MAX_PERFUMES + 1)
    .lean();

  if (perfumes.length > LOOKUP_MAX_PERFUMES) {
    lookupCache.set(LOOKUP_KEY, { tooLarge: true });
    return null;
  }

  const rows = [];
  perfumes.forEach((perfume) => {
    if (perfume.hasVariants && perfume.variants?.length) {
      perfume.variants.filter((v) => v.isActive).forEach((variant) => rows.push(optionRow(perfume, variant)));
    } else {
      rows.push(optionRow(perfume, null));
    }
  });

  lookupCache.set(LOOKUP_KEY, { rows });
  return rows;
};

const queryOptions = async (q, limit) => {
  const filter = { status: 'published' };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { sku: rx }, { brand: rx }, { 'variants.sku': rx }];
  }

  const perfumes = await Perfume.find(filter).select(LOOKUP_FIELDS).sort({ name: 1 }).limit(limit).lean();

  const rows = [];
  perfumes.forEach((perfume) => {
    if (perfume.hasVariants && perfume.variants?.length) {
      perfume.variants.filter((v) => v.isActive).forEach((variant) => rows.push(optionRow(perfume, variant)));
    } else {
      rows.push(optionRow(perfume, null));
    }
  });
  return rows;
};

export const lookupPerfumes = asyncHandler(async (req, res) => {
  const { q, limit } = req.query;
  const term = String(q || '').trim().toLowerCase();

  const cachedRows = await publishedOptions();

  let matches;
  if (cachedRows) {
    matches = term ? cachedRows.filter((row) => row.haystack.includes(term)) : cachedRows;
    matches = matches.slice(0, limit);
  } else {
    matches = (await queryOptions(q, limit)).slice(0, limit);
  }

  // Stock is read live, not from the cache.
  const perfumeIds = [...new Set(matches.map((row) => String(row.perfumeId)))];
  const live = perfumeIds.length
    ? await Perfume.find({ _id: { $in: perfumeIds } }).select('stock').lean()
    : [];
  const stockById = new Map(live.map((row) => [String(row._id), Number(row.stock) || 0]));

  const options = matches.map(({ haystack, ...row }) => {
    const stock = stockById.get(String(row.perfumeId)) ?? 0;
    return {
      ...row,
      stock,
      unitsAvailable: unitsFromGrams(stock, row.sizeGrams),
    };
  });

  return sendSuccess(res, { message: 'Perfumes loaded', data: options });
});

export const getPerfume = asyncHandler(async (req, res) => {
  const perfume = await Perfume.findById(req.params.id)
    .populate('createdBy', 'name email')
    .populate('updatedBy', 'name email')
    .lean();

  if (!perfume) throw ApiError.notFound('Perfume not found');

  // Sales split per fill size, so different sizes are not lumped into one unit count.
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

  // Prefer the current variant label in case a size was renamed after the sale.
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

const stampSkus = async (payload) => {
  const sku = payload.sku || (await generateSku());
  const variants = (payload.variants || []).map((variant, index) => ({
    ...variant,
    sku: variant.sku || variantSkuFrom(sku, variant, index),
  }));
  return { ...payload, sku, variants };
};

/** Preview SKU the wizard shows before a new perfume is saved. */
export const getNextSku = asyncHandler(async (req, res) => {
  const prefix = await getSkuPrefix();
  const sku = await generateSku(prefix);
  return sendSuccess(res, { message: 'SKU generated', data: { sku, prefix } });
});

export const createPerfume = asyncHandler(async (req, res) => {
  const autoNumbered = !req.body.sku;
  let payload = await stampSkus(req.body);

  // Two saves at once can get the same generated SKU, so re-roll it on conflict.
  // A SKU the admin typed is reported instead.
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
    createdVia: 'manual',
    updatedBy: req.user._id,
    updatedAction: 'created',
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

  // An empty SKU means "unchanged", not "renumber". Blank variant SKUs are still derived.
  if (!req.body.sku) delete req.body.sku;
  if (Array.isArray(req.body.variants)) {
    req.body.variants = req.body.variants.map((variant, index) => ({
      ...variant,
      sku: variant.sku || variantSkuFrom(perfume.sku, variant, index),
    }));
  }

  await assertSkusAreFree({ ...perfume.toObject(), ...req.body }, perfume._id);

  const { stock: requestedStock, ...details } = req.body;
  if (requestedStock !== undefined && Number(requestedStock) !== Number(perfume.stock)) {
    const moved = await setStockExpecting(perfume._id, perfume.stock, Number(requestedStock));
    if (!moved) throw stockMovedUnderYou(perfume, perfume.stock);
    perfume.stock = moved.stock;
  }

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
  if (Array.isArray(req.body.variants)) {
    const keep = new Set(
      [...req.body.variants.map((v) => v.image?.publicId), ...(req.body.images || []).map((i) => i.publicId)].filter(
        Boolean
      )
    );
    const orphaned = perfume.variants.filter((v) => v.image?.publicId && !keep.has(v.image.publicId));
    await Promise.all(orphaned.map((v) => destroyAsset(v.image.publicId, 'image')));
  }

  Object.assign(perfume, details, { updatedBy: req.user._id, updatedAction: 'details' });
  await perfume.save();

  return sendSuccess(res, { message: `"${perfume.name}" updated`, data: decorate(perfume.toObject()) });
});

export const updatePerfumeStatus = asyncHandler(async (req, res) => {
  const perfume = await Perfume.findById(req.params.id);
  if (!perfume) throw ApiError.notFound('Perfume not found');

  if (req.body.status === 'published' && !perfume.images?.length) {
    throw ApiError.badRequest('Add at least one perfume image before publishing');
  }

  if (req.body.status === 'published' && !(Number(perfume.stock) > 0)) {
    throw ApiError.badRequest('Add stock before publishing');
  }

  perfume.status = req.body.status;
  perfume.updatedBy = req.user._id;
  perfume.updatedAction = 'status';
  await perfume.save();

  return sendSuccess(res, {
    message: `"${perfume.name}" is now ${perfume.status}`,
    data: decorate(perfume.toObject()),
  });
});

// Inline stock correction from the perfumes table. Values are in grams.
export const adjustStock = asyncHandler(async (req, res) => {
  const { stock, addStock, lowStockThreshold } = req.body;

  if (addStock !== undefined) {
    const perfume = await incrementStock(req.params.id, addStock, req.user._id);
    if (!perfume) {
      // Either the perfume is gone or the removal exceeds the stock.
      const exists = await Perfume.exists({ _id: req.params.id });
      if (!exists) throw ApiError.notFound('Perfume not found');
      throw ApiError.badRequest('That is more stock than this perfume has on hand');
    }

    if (lowStockThreshold !== undefined) {
      await Perfume.updateOne({ _id: perfume._id }, [
        {
          $set: {
            lowStockThreshold,
            stockMargin: { $subtract: [{ $ifNull: ['$stock', 0] }, lowStockThreshold] },
          },
        },
      ]);
      perfume.lowStockThreshold = lowStockThreshold;
    }

    return sendSuccess(res, {
      message: `"${perfume.name}" now holds ${formatGrams(perfume.stock)}`,
      data: decorate(perfume),
    });
  }

  const perfume = await Perfume.findById(req.params.id);
  if (!perfume) throw ApiError.notFound('Perfume not found');

  // Only write if stock is unchanged since it was read, so a sale in between is not overwritten.
  const updated = await setStockExpecting(perfume._id, perfume.stock, stock, {
    ...(lowStockThreshold !== undefined ? { lowStockThreshold } : {}),
    updatedBy: req.user._id,
    updatedAction: 'stock',
  });

  if (!updated) throw stockMovedUnderYou(perfume, perfume.stock);

  return sendSuccess(res, { message: 'Stock updated', data: decorate(updated.toObject()) });
});


const STOCK_FIELDS = 'name sku brand stock lowStockThreshold status images.url';

const stockOption = (perfume) => {
  const stock = perfume.stock || 0;
  const threshold = perfume.lowStockThreshold ?? 100;
  return {
    id: perfume._id,
    name: perfume.name,
    sku: perfume.sku,
    brand: perfume.brand || '',
    image: perfume.images?.[0]?.url || '',
    stock,
    lowStockThreshold: threshold,
    isLowStock: stock > 0 && stock <= threshold,
    isOutOfStock: stock <= 0,
    status: perfume.status,
  };
};

const incrementStock = (id, delta, userId, action = 'stock') =>
  Perfume.findOneAndUpdate(
    delta < 0 ? { _id: id, stock: { $gte: -delta } } : { _id: id },
    // stockMargin = stock - lowStockThreshold, so both move by the same delta in one atomic $inc.
    { $inc: { stock: delta, stockMargin: delta }, $set: { updatedBy: userId, updatedAction: action } },
    { new: true }
  )
    .select(`${STOCK_FIELDS} mrp discountPercent finalPrice sizeGrams hasVariants variants createdAt`)
    .lean();

const setStockExpecting = (id, expected, next, extra = {}) => {
  const nextThreshold = extra.lowStockThreshold;
  const stockMargin =
    nextThreshold === undefined
      ? { $subtract: [next, { $ifNull: ['$lowStockThreshold', 100] }] }
      : round2(next - nextThreshold);

  return Perfume.findOneAndUpdate(
    { _id: id, stock: expected },
    [{ $set: { stock: next, ...extra, stockMargin } }],
    { new: true }
  );
};

/** Conflict raised when stock changed between read and write. */
const stockMovedUnderYou = (perfume, was) =>
  ApiError.conflict(
    `"${perfume.name}" was billed while you were editing — it held ${formatGrams(was)} when the screen ` +
      'loaded and holds less now. Reload the perfume and enter the figure again.'
  );

export const searchStockTargets = asyncHandler(async (req, res) => {
  const { q, limit } = req.query;

  const filter = { status: { $ne: 'archived' } };
  if (q) {
    Object.assign(filter, buildPerfumeSearch(q));
  } else {
    filter.$expr = { $lte: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$lowStockThreshold', 100] }] };
  }

  const perfumes = await Perfume.find(filter)
    .select(STOCK_FIELDS)
    // Lowest stock first when browsing, alphabetical when searching.
    .sort(q ? { name: 1 } : { stock: 1, name: 1 })
    .limit(limit)
    .lean();

  return sendSuccess(res, {
    message: 'Perfumes loaded',
    data: perfumes.map(stockOption),
    meta: { needsRestockOnly: !q },
  });
});

/** Ignores case and extra whitespace when comparing names. */
const normaliseName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

// Matches names from an uploaded sheet against the catalogue.
export const resolveStockNames = asyncHandler(async (req, res) => {
  const perfumes = await Perfume.find({ status: { $ne: 'archived' } })
    .select(STOCK_FIELDS)
    .lean();

  const byName = new Map();
  const bySku = new Map();
  perfumes.forEach((perfume) => {
    const key = normaliseName(perfume.name);
    // Duplicate names are flagged as ambiguous.
    if (byName.has(key)) byName.get(key).ambiguous = true;
    else byName.set(key, { perfume, ambiguous: false });

    if (perfume.sku) bySku.set(normaliseName(perfume.sku), perfume);
  });

  const rows = req.body.names.map((name) => {
    const key = normaliseName(name);
    const hit = byName.get(key);

    // The name column may hold SKUs instead.
    const perfume = hit?.perfume || bySku.get(key);
    if (!perfume) return { name, matched: false, reason: 'No perfume in the catalogue has this name' };
    if (hit?.ambiguous) {
      return { name, matched: false, reason: 'Two perfumes share this name — update them one at a time' };
    }

    return { name, matched: true, ...stockOption(perfume) };
  });

  return sendSuccess(res, {
    message: 'Rows matched',
    data: rows,
    meta: { matched: rows.filter((row) => row.matched).length, total: rows.length },
  });
});

export const bulkAdjustStock = asyncHandler(async (req, res) => {
  const { items, source } = req.body;
  // The single stock screen also uses this endpoint; audit by the screen used.
  const action = source === 'single' ? 'stock' : 'bulk-stock';

  // Merge duplicate rows per perfume so the bulk write does not race itself.
  const merged = new Map();
  items.forEach(({ id, addStock }) => {
    merged.set(id, (merged.get(id) || 0) + addStock);
  });

  const ids = [...merged.keys()];
  const targets = await Perfume.find({ _id: { $in: ids } }).select('name stock').lean();
  const byId = new Map(targets.map((perfume) => [String(perfume._id), perfume]));

  const failed = [];
  const operations = [];

  ids.forEach((id) => {
    const delta = merged.get(id);
    const perfume = byId.get(id);

    if (!perfume) {
      failed.push({ id, name: '', reason: 'This perfume no longer exists' });
      return;
    }
    if (!delta) {
      failed.push({ id, name: perfume.name, reason: 'No change — the new stock was zero' });
      return;
    }
    if (delta < 0 && (perfume.stock || 0) < -delta) {
      failed.push({ id, name: perfume.name, reason: 'That is more stock than this perfume has on hand' });
      return;
    }

    operations.push({
      updateOne: {
        // Re-check stock in the filter: a bill may have reduced it since the read.
        filter: delta < 0 ? { _id: id, stock: { $gte: -delta } } : { _id: id },
        update: {
          $inc: { stock: delta, stockMargin: delta },
          $set: { updatedBy: req.user._id, updatedAction: action },
        },
      },
    });
  });

  let updated = 0;
  if (operations.length) {
    const result = await Perfume.bulkWrite(operations, { ordered: false });
    updated = result.modifiedCount ?? 0;

    // Rows that failed the guard were sold from in between.
    const missed = operations.length - (result.matchedCount ?? 0);
    if (missed > 0) {
      failed.push({
        id: '',
        name: '',
        reason: `${missed} perfume(s) were billed while you were reviewing — check and retry those`,
      });
    }
  }

  return sendSuccess(res, {
    message: updated
      ? `Stock updated for ${updated} perfume${updated === 1 ? '' : 's'}`
      : 'No stock was changed',
    data: { updated, skipped: failed.length, failed },
  });
});


const PRICE_FIELDS =
  'name sku brand status images.url mrp discountPercent finalPrice ' +
  'variants.sku variants.label variants.options variants.sizeGrams ' +
  'variants.mrp variants.discountPercent variants.sellingPrice variants.isActive';

/** Perfume for the repricing screen, sizes sorted smallest first. */
const priceOption = (perfume) => {
  const variants = (perfume.variants || [])
    .map((variant) => ({
      sku: variant.sku,
      label: variant.label || '',
      sizeGrams: resolveSizeGrams(variant),
      mrp: Number(variant.mrp) || 0,
      discountPercent: Number(variant.discountPercent) || 0,
      sellingPrice: Number(variant.sellingPrice) || 0,
      isActive: variant.isActive !== false,
    }))
    .sort((a, b) => a.sizeGrams - b.sizeGrams);

  const priced = variants.map((v) => v.mrp).filter((mrp) => mrp > 0);

  return {
    id: perfume._id,
    name: perfume.name,
    sku: perfume.sku,
    brand: perfume.brand || '',
    image: perfume.images?.[0]?.url || '',
    status: perfume.status,
    priceMin: priced.length ? Math.min(...priced) : 0,
    priceMax: priced.length ? Math.max(...priced) : 0,
    variants,
  };
};

export const searchPriceTargets = asyncHandler(async (req, res) => {
  const { q, limit } = req.query;

  const filter = { status: { $ne: 'archived' } };
  if (q) Object.assign(filter, buildPerfumeSearch(q));

  const perfumes = await Perfume.find(filter).select(PRICE_FIELDS).sort({ name: 1 }).limit(limit).lean();

  return sendSuccess(res, { message: 'Perfumes loaded', data: perfumes.map(priceOption) });
});

// Matches names from an uploaded sheet against the catalogue.
export const resolvePriceNames = asyncHandler(async (req, res) => {
  const perfumes = await Perfume.find({ status: { $ne: 'archived' } }).select(PRICE_FIELDS).lean();

  const byName = new Map();
  const bySku = new Map();
  perfumes.forEach((perfume) => {
    const key = normaliseName(perfume.name);
    // Duplicate names are flagged as ambiguous.
    if (byName.has(key)) byName.get(key).ambiguous = true;
    else byName.set(key, { perfume, ambiguous: false });

    if (perfume.sku) bySku.set(normaliseName(perfume.sku), perfume);
  });

  const rows = req.body.names.map((name) => {
    const key = normaliseName(name);
    const hit = byName.get(key);

    // The name column may hold SKUs instead.
    const perfume = hit?.perfume || bySku.get(key);
    if (!perfume) return { name, matched: false, reason: 'No perfume in the catalogue has this name' };
    if (hit?.ambiguous) {
      return { name, matched: false, reason: 'Two perfumes share this name — reprice them one at a time' };
    }
    if (!perfume.variants?.length) {
      return { name, matched: false, reason: 'This perfume has no sizes to price' };
    }

    return { name, matched: true, ...priceOption(perfume) };
  });

  return sendSuccess(res, {
    message: 'Rows matched',
    data: rows,
    meta: { matched: rows.filter((row) => row.matched).length, total: rows.length },
  });
});

export const bulkUpdatePrices = asyncHandler(async (req, res) => {
  const { items, source } = req.body;
  // The single repricing screen also uses this endpoint; audit by the screen used.
  const action = source === 'single' ? 'price' : 'bulk-price';

  // Duplicate rows for a perfume: the last one wins.
  const merged = new Map();
  items.forEach(({ id, prices }) => merged.set(id, prices));

  const ids = [...merged.keys()];
  const targets = await Perfume.find({ _id: { $in: ids } }).select('name variants').lean();
  const byId = new Map(targets.map((perfume) => [String(perfume._id), perfume]));

  const failed = [];
  const operations = [];
  let repricedSizes = 0;

  ids.forEach((id) => {
    const perfume = byId.get(id);

    if (!perfume) {
      failed.push({ id, name: '', reason: 'This perfume no longer exists' });
      return;
    }
    if (!perfume.variants?.length) {
      failed.push({ id, name: perfume.name, reason: 'This perfume has no sizes to price' });
      return;
    }

    const wanted = pricesBySize(merged.get(id));

    // Only the sizes named in the sheet change; others keep their price.
    let moved = 0;
    const variants = perfume.variants.map((variant) => {
      const next = wanted.get(resolveSizeGrams(variant));
      const current = Number(variant.mrp) || 0;
      const mrp = next === undefined ? current : next;
      if (mrp !== current) moved += 1;

      return { ...variant, mrp, sellingPrice: computeFinalPrice(mrp, variant.discountPercent) };
    });

    if (!moved) {
      failed.push({ id, name: perfume.name, reason: 'Already at these prices — nothing to change' });
      return;
    }
    repricedSizes += moved;

    // Base price = cheapest active size (matches `basePricingFor` in the admin).
    const sellable = variants.filter((v) => v.isActive !== false && (Number(v.mrp) || 0) > 0);
    const pool = sellable.length ? sellable : variants;
    const cheapest = pool.reduce((best, v) => (v.sellingPrice < best.sellingPrice ? v : best), pool[0]);

    operations.push({
      updateOne: {
        filter: { _id: id },
        update: {
          $set: {
            variants,
            mrp: Number(cheapest?.mrp) || 0,
            discountPercent: Number(cheapest?.discountPercent) || 0,
            finalPrice: computeFinalPrice(cheapest?.mrp, cheapest?.discountPercent),
            updatedBy: req.user._id,
            updatedAction: action,
          },
        },
      },
    });
  });

  let updated = 0;
  if (operations.length) {
    const result = await Perfume.bulkWrite(operations, { ordered: false });
    updated = result.modifiedCount ?? 0;
  }

  return sendSuccess(res, {
    message: updated
      ? `Prices updated for ${updated} perfume${updated === 1 ? '' : 's'}`
      : 'No prices were changed',
    data: { updated, repricedSizes, skipped: failed.length, failed },
  });
});

export const deletePerfume = asyncHandler(async (req, res) => {
  const perfume = await Perfume.findById(req.params.id);
  if (!perfume) throw ApiError.notFound('Perfume not found');

  // A perfume referenced by a bill must never vanish — archive it instead.
  const billed = await Bill.countDocuments({ 'items.perfume': perfume._id });
  if (billed > 0) {
    perfume.status = 'archived';
    perfume.updatedBy = req.user._id;
    perfume.updatedAction = 'archived';
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


/** Names already in the catalogue, as a Set of normalised keys. */
const takenNames = async () => {
  const rows = await Perfume.find().select('name').lean();
  return new Set(rows.map((row) => normaliseName(row.name)));
};

export const previewBulkCreate = asyncHandler(async (req, res) => {
  const [taken, prefix] = await Promise.all([takenNames(), getSkuPrefix()]);

  const seen = new Set();
  const rows = req.body.names.map((name) => {
    const key = normaliseName(name);

    if (taken.has(key)) {
      return { name, available: false, reason: 'A perfume with this name is already in the catalogue' };
    }
    if (seen.has(key)) return { name, available: false, reason: 'Listed more than once in this sheet' };
    seen.add(key);

    return { name, available: true };
  });

  // Only creatable rows get a SKU, so the preview matches what gets saved.
  const skus = await generateSkuBlock(rows.filter((row) => row.available).length, prefix);
  let next = 0;
  rows.forEach((row) => {
    if (row.available) row.sku = skus[next++];
  });

  return sendSuccess(res, {
    message: 'Rows checked',
    data: rows,
    meta: { prefix, creatable: next, total: rows.length },
  });
});

const bulkPerfumeDoc = (item, sku, userId) => {
  const variants = [...pricesBySize(item.prices).entries()]
    .sort(([a], [b]) => a - b)
    .map(([sizeGrams, mrp]) => ({
      label: `${sizeGrams}gm`,
      options: { Size: `${sizeGrams}gm` },
      // Same suffix as the wizard: AP-925 + 50gm -> AP-925-50GM.
      sku: `${sku}-${sizeGrams}GM`,
      mrp,
      discountPercent: 0,
      sellingPrice: computeFinalPrice(mrp, 0),
      sizeGrams,
      isActive: true,
      image: { url: '', publicId: '' },
      barcode: '',
      hsnCode: '',
    }));

  // Base price = cheapest size, same as the wizard.
  const cheapest = variants.reduce((best, v) => (v.sellingPrice < best.sellingPrice ? v : best), variants[0]);

  const images = item.image
    ? [{ url: item.image, publicId: item.imagePublicId || '', alt: item.name }]
    : [];

  return {
    name: item.name,
    slug: slugify(item.name, { lower: true, strict: true, trim: true }),
    sku,
    brand: item.brand || '',
    category: item.category || '',
    stock: item.stock || 0,
    lowStockThreshold: 100,
    // insertMany skips the pre-save hook, so derived fields (stockMargin, slug, finalPrice) are set by hand.
    stockMargin: (item.stock || 0) - 100,
    images,
    hasVariants: true,
    variantAttributes: [
      { name: 'Size', selectorStyle: 'automatic', values: variants.map((variant) => variant.label) },
    ],
    variants,
    mrp: cheapest.mrp,
    discountPercent: 0,
    finalPrice: cheapest.sellingPrice,
    status: images.length && Number(item.stock) > 0 ? 'published' : 'draft',
    createdBy: userId,
    createdVia: 'bulk-upload',
    updatedBy: userId,
    updatedAction: 'bulk-upload',
  };
};

/** Insert batch size, so a huge sheet is not one huge write. */
const INSERT_BATCH = 200;

// Returns the inserted docs and the ones that failed.
const insertPerfumes = async (docs) => {
  const inserted = [];
  const failed = [];

  for (let start = 0; start < docs.length; start += INSERT_BATCH) {
    const batch = docs.slice(start, start + INSERT_BATCH);
    try {
      // Sequential on purpose to avoid flooding the database.
      // eslint-disable-next-line no-await-in-loop
      const rows = await Perfume.insertMany(batch, { ordered: false });
      inserted.push(...rows);
    } catch (error) {
      // Partial failure: the rest are still inserted and both are reported.
      (error.insertedDocs || []).forEach((row) => inserted.push(row));

      const errors = error.writeErrors || (error.code ? [error] : []);
      if (!errors.length) throw error;

      errors.forEach((writeError) => {
        const index = writeError.index ?? writeError.err?.index ?? 0;
        failed.push({ doc: batch[index], duplicate: (writeError.code ?? writeError.err?.code) === 11000 });
      });
    }
  }

  return { inserted, failed };
};

/** Converts a doc back to `bulkPerfumeDoc` input for a retry. */
const asBulkItem = (doc) => ({
  name: doc.name,
  brand: doc.brand,
  category: doc.category,
  stock: doc.stock,
  image: doc.images?.[0]?.url || '',
  imagePublicId: doc.images?.[0]?.publicId || '',
  prices: doc.variants.map((variant) => ({ sizeGrams: variant.sizeGrams, mrp: variant.mrp })),
});

export const bulkCreatePerfumes = asyncHandler(async (req, res) => {
  const { items } = req.body;

  const taken = await takenNames();
  const seen = new Set();
  const skipped = [];
  const accepted = [];

  items.forEach((item) => {
    const key = normaliseName(item.name);

    if (taken.has(key)) {
      skipped.push({ name: item.name, reason: 'A perfume with this name is already in the catalogue' });
      return;
    }
    if (seen.has(key)) {
      skipped.push({ name: item.name, reason: 'Listed more than once — only the first row was used' });
      return;
    }
    seen.add(key);
    accepted.push(item);
  });

  const userId = req.user._id;
  let created = [];

  if (accepted.length) {
    const skus = await generateSkuBlock(accepted.length);
    const docs = accepted.map((item, index) => bulkPerfumeDoc(item, skus[index], userId));

    const first = await insertPerfumes(docs);
    created = first.inserted;

    // SKU clashes from a simultaneous upload are retried with new SKUs; other errors are reported.
    const clashed = first.failed.filter((row) => row.duplicate).map((row) => row.doc);
    first.failed
      .filter((row) => !row.duplicate)
      .forEach((row) => skipped.push({ name: row.doc?.name || '', reason: 'This perfume could not be saved' }));

    if (clashed.length) {
      const retrySkus = await generateSkuBlock(clashed.length);
      const retryDocs = clashed.map((doc, index) => bulkPerfumeDoc(asBulkItem(doc), retrySkus[index], userId));

      const second = await insertPerfumes(retryDocs);
      created = created.concat(second.inserted);
      second.failed.forEach((row) =>
        skipped.push({ name: row.doc?.name || '', reason: 'Another upload took this SKU — try this row again' })
      );
    }
  }

  const published = created.filter((perfume) => perfume.status === 'published').length;

  return sendSuccess(res, {
    message: created.length
      ? `${created.length} perfume${created.length === 1 ? '' : 's'} added to your catalogue`
      : 'No perfumes were added',
    data: {
      created: created.length,
      published,
      drafts: created.length - published,
      skipped: skipped.length,
      failed: skipped,
      // The saved SKUs, which may differ from the preview.
      perfumes: created.map((perfume) => ({
        id: perfume._id,
        name: perfume.name,
        sku: perfume.sku,
        status: perfume.status,
      })),
    },
  });
});
