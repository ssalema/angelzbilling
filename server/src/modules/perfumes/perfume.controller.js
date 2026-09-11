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

// Adds the derived numbers the list view needs to lean (non-hydrated) docs.
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

  // Uppercase alphanumerics with optional dashes/underscores is a SKU, not a
  // perfume name — no one types "AP-OUD-100" looking for a name.
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
    // Running dry but still sellable — the two are counted apart because the UI
    // names them apart.
    if (stock === 'low') Object.assign(filter, { stock: { $gt: 0 }, stockMargin: { $lte: 0 } });
    if (stock === 'in') filter.stockMargin = { $gt: 0 };
    // Everything that needs restocking — what the dashboard's alert panel lists,
    // so its "Manage" link lands on the same set rather than only the low half.
    if (stock === 'restock') filter.stockMargin = { $lte: 0 };
  }

  // Only what the table and `decorate` actually read.
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


// Only what a type-ahead row draws or prices from.
const LOOKUP_FIELDS =
  'name sku brand mrp discountPercent finalPrice sizeGrams hasVariants hsnCode images.url ' +
  'variants.sku variants.label variants.options variants.isActive variants.mrp ' +
  'variants.discountPercent variants.sellingPrice variants.sizeGrams variants.image.url variants.hsnCode';

// How large a catalogue this may hold in memory before it stops trying.
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
    // Lowercased once at build time so the filter does no per-keystroke casing.
    haystack: [perfume.name, perfume.sku, perfume.brand, variant?.sku, variant?.label]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  };
};

// Every sellable row in the catalogue, built once and held until a catalogue write drops it.
const publishedOptions = async () => {
  const cached = lookupCache.get(LOOKUP_KEY);
  if (cached) return cached.tooLarge ? null : cached.rows;

  const perfumes = await Perfume.find({ status: 'published' })
    .select(LOOKUP_FIELDS)
    .sort({ name: 1 })
    // One over the ceiling, so hitting it is detectable without a second count.
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

  // Stock, read now rather than from the cache.
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

// Quick inline stock correction from the perfumes table — the value is grams.
export const adjustStock = asyncHandler(async (req, res) => {
  const { stock, addStock, lowStockThreshold } = req.body;

  if (addStock !== undefined) {
    const perfume = await incrementStock(req.params.id, addStock, req.user._id);
    if (!perfume) {
      // Either it is gone, or the removal asked for more grams than exist.
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

  // An absolute figure is only true of the shelf it was read off, so it is
  // written against that reading rather than over whatever is there now.
  const updated = await setStockExpecting(perfume._id, perfume.stock, stock, {
    ...(lowStockThreshold !== undefined ? { lowStockThreshold } : {}),
    updatedBy: req.user._id,
    updatedAction: 'stock',
  });

  if (!updated) throw stockMovedUnderYou(perfume, perfume.stock);

  return sendSuccess(res, { message: 'Stock updated', data: decorate(updated.toObject()) });
});


/** The fields the stock screen reads, and nothing else. */
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
    // `stockMargin` is `stock - lowStockThreshold`, so a delta on the weight is
    // the same delta on the margin and this stays one atomic `$inc`.
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

/** The conflict every absolute stock write raises when it was beaten to the shelf. */
const stockMovedUnderYou = (perfume, was) =>
  ApiError.conflict(
    `"${perfume.name}" was billed while you were editing — it held ${formatGrams(was)} when the screen ` +
      'loaded and holds less now. Reload the perfume and enter the figure again.'
  );

// Type-ahead for the single stock update.
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
    // Lowest weight first when browsing, alphabetical once a term narrows it.
    .sort(q ? { name: 1 } : { stock: 1, name: 1 })
    .limit(limit)
    .lean();

  return sendSuccess(res, {
    message: 'Perfumes loaded',
    data: perfumes.map(stockOption),
    meta: { needsRestockOnly: !q },
  });
});

/** Whitespace and case are the difference between two spellings of one name. */
const normaliseName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

// Matches the names read out of an uploaded sheet against the catalogue.
export const resolveStockNames = asyncHandler(async (req, res) => {
  const perfumes = await Perfume.find({ status: { $ne: 'archived' } })
    .select(STOCK_FIELDS)
    .lean();

  const byName = new Map();
  const bySku = new Map();
  perfumes.forEach((perfume) => {
    const key = normaliseName(perfume.name);
    // First writer wins, and the flag says a second one existed.
    if (byName.has(key)) byName.get(key).ambiguous = true;
    else byName.set(key, { perfume, ambiguous: false });

    if (perfume.sku) bySku.set(normaliseName(perfume.sku), perfume);
  });

  const rows = req.body.names.map((name) => {
    const key = normaliseName(name);
    const hit = byName.get(key);

    // A sheet exported from the catalogue may carry SKUs in the name column.
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

// Applies the reviewed sheet.
export const bulkAdjustStock = asyncHandler(async (req, res) => {
  const { items, source } = req.body;
  // The single stock screen posts here too, so the audit line follows the
  // screen the admin actually used rather than the route they happened to hit.
  const action = source === 'single' ? 'stock' : 'bulk-stock';

  // The same perfume twice in one sheet would race itself inside the bulk
  // write, so the rows are folded into a single movement per perfume first.
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
        // The guard is repeated in the filter, not just checked above: the read
        // is a moment old and a bill may have drawn the weight down since.
        filter: delta < 0 ? { _id: id, stock: { $gte: -delta } } : { _id: id },
        // Both move by the same delta — see `incrementStock`.
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

    // A row that passed the read but lost the guard was sold from in between.
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


/** The fields the repricing screen reads, and nothing else. */
const PRICE_FIELDS =
  'name sku brand status images.url mrp discountPercent finalPrice ' +
  'variants.sku variants.label variants.options variants.sizeGrams ' +
  'variants.mrp variants.discountPercent variants.sellingPrice variants.isActive';

/** One perfume as the repricing screen reads it: its sizes, smallest fill first. */
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
    /** What the perfume sells for today, cheapest fill to dearest. */
    priceMin: priced.length ? Math.min(...priced) : 0,
    priceMax: priced.length ? Math.max(...priced) : 0,
    variants,
  };
};

// Type-ahead for the single repricing flow.
export const searchPriceTargets = asyncHandler(async (req, res) => {
  const { q, limit } = req.query;

  const filter = { status: { $ne: 'archived' } };
  if (q) Object.assign(filter, buildPerfumeSearch(q));

  const perfumes = await Perfume.find(filter).select(PRICE_FIELDS).sort({ name: 1 }).limit(limit).lean();

  return sendSuccess(res, { message: 'Perfumes loaded', data: perfumes.map(priceOption) });
});

// Matches the names read out of an uploaded sheet against the catalogue.
export const resolvePriceNames = asyncHandler(async (req, res) => {
  const perfumes = await Perfume.find({ status: { $ne: 'archived' } }).select(PRICE_FIELDS).lean();

  const byName = new Map();
  const bySku = new Map();
  perfumes.forEach((perfume) => {
    const key = normaliseName(perfume.name);
    // First writer wins, and the flag says a second one existed.
    if (byName.has(key)) byName.get(key).ambiguous = true;
    else byName.set(key, { perfume, ambiguous: false });

    if (perfume.sku) bySku.set(normaliseName(perfume.sku), perfume);
  });

  const rows = req.body.names.map((name) => {
    const key = normaliseName(name);
    const hit = byName.get(key);

    // A sheet exported from the catalogue may carry SKUs in the name column.
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

// Applies the reviewed prices — the one call in this trio that writes.
export const bulkUpdatePrices = asyncHandler(async (req, res) => {
  const { items, source } = req.body;
  // As with stock: the single repricing screen shares this endpoint, and the
  // audit line should name the screen, not the route.
  const action = source === 'single' ? 'price' : 'bulk-price';

  // The same perfume twice in one sheet is a contradiction, not an addition —
  // the last set of prices given wins, which is what correcting a row means.
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

    // Every variant is rewritten, but only the fills actually named change —
    // an untouched size keeps its own price rather than being recalculated.
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

    // The perfume's own price is the cheapest row still on sale, matching
    // `basePricingFor` in the admin and what a listing reads as "from ₹…".
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

  // Only the rows that will actually be created consume a number, so the run
  // the admin reviews is the run the catalogue ends up with.
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

// One reviewed row as a complete perfume document.
const bulkPerfumeDoc = (item, sku, userId) => {
  const variants = [...pricesBySize(item.prices).entries()]
    .sort(([a], [b]) => a - b)
    .map(([sizeGrams, mrp]) => ({
      label: `${sizeGrams}gm`,
      options: { Size: `${sizeGrams}gm` },
      // The same suffix the wizard builds — AP-925 + 50gm -> AP-925-50GM.
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

  // The perfume's own price is the cheapest size it sells, matching what the
  // wizard writes and what a listing reads as "from ₹…".
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
    // `insertMany` skips the pre-save hook, so every derived field is written out
    // here by hand — `stockMargin` alongside `slug` and `finalPrice` below.
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

/** Rows are written in batches so one enormous sheet is not one enormous write. */
const INSERT_BATCH = 200;

// Inserts the documents, returning what went in and which ones bounced.
const insertPerfumes = async (docs) => {
  const inserted = [];
  const failed = [];

  for (let start = 0; start < docs.length; start += INSERT_BATCH) {
    const batch = docs.slice(start, start + INSERT_BATCH);
    try {
      // Sequential on purpose: a thousand-row sheet firing every batch at once
      // is a burst the database gains nothing from.
      // eslint-disable-next-line no-await-in-loop
      const rows = await Perfume.insertMany(batch, { ordered: false });
      inserted.push(...rows);
    } catch (error) {
      // A partial failure still inserts the rest; both halves are reported.
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

/** A written document back in the shape `bulkPerfumeDoc` accepts, for a retry. */
const asBulkItem = (doc) => ({
  name: doc.name,
  brand: doc.brand,
  category: doc.category,
  stock: doc.stock,
  image: doc.images?.[0]?.url || '',
  imagePublicId: doc.images?.[0]?.publicId || '',
  prices: doc.variants.map((variant) => ({ sizeGrams: variant.sizeGrams, mrp: variant.mrp })),
});

// Creates the reviewed perfumes.
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

    // A number taken by a simultaneous upload is ours to re-roll — the admin
    // never chose it. Anything else is reported as it happened.
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
      // What actually got written, so the finished screen can show real SKUs
      // rather than the ones the review projected.
      perfumes: created.map((perfume) => ({
        id: perfume._id,
        name: perfume.name,
        sku: perfume.sku,
        status: perfume.status,
      })),
    },
  });
});
