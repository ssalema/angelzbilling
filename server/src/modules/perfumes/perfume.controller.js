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

/**
 * Same idea as the bill search: recognise a SKU and seek the index for it,
 * rather than running an unindexable five-field `$or` over the catalogue.
 *
 * SKUs are stored uppercase and both `sku` and `variants.sku` are indexed, so a
 * term that looks like one becomes an anchored, case-sensitive prefix match.
 * Anything else is treated as a name/brand search, which still scans — a
 * catalogue is orders of magnitude smaller than the bill collection, so that is
 * an acceptable cost where it was not for bills.
 */
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
    // Everything that needs restocking — what the dashboard's alert panel lists,
    // so its "Manage" link lands on the same set rather than only the low half.
    if (stock === 'restock') filter.$expr = { $lte: [gramsOnHand, threshold] };
  }

  /**
   * Only what the table and `decorate` actually read. An unprojected perfume
   * drags along `description` (up to 8,000 characters), `faqs`, `features`,
   * every video and the full variant rows — none of it drawn in a list, and on
   * a 50-row page it is the overwhelming majority of the response.
   *
   * The variant subfields are exactly the ones `decorate` and
   * `smallestFillGrams` need: price for the range, size/label/options to work
   * out the smallest fill, isActive to ignore retired sizes, and the image only
   * as a fallback when the perfume itself has none.
   */
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
  const { stock, addStock, lowStockThreshold } = req.body;

  // `addStock` is a delivery, not a total: the grams go on with `$inc` in one
  // atomic step, so a bottle billed while the admin was typing is still
  // subtracted rather than being erased by a stale "available + new" figure.
  if (addStock !== undefined) {
    const perfume = await incrementStock(req.params.id, addStock, req.user._id);
    if (!perfume) {
      // Either it is gone, or the removal asked for more grams than exist.
      const exists = await Perfume.exists({ _id: req.params.id });
      if (!exists) throw ApiError.notFound('Perfume not found');
      throw ApiError.badRequest('That is more stock than this perfume has on hand');
    }

    if (lowStockThreshold !== undefined) {
      await Perfume.updateOne({ _id: perfume._id }, { $set: { lowStockThreshold } });
      perfume.lowStockThreshold = lowStockThreshold;
    }

    return sendSuccess(res, {
      message: `"${perfume.name}" now holds ${formatGrams(perfume.stock)}`,
      data: decorate(perfume),
    });
  }

  const perfume = await Perfume.findById(req.params.id);
  if (!perfume) throw ApiError.notFound('Perfume not found');

  perfume.stock = stock;
  if (lowStockThreshold !== undefined) perfume.lowStockThreshold = lowStockThreshold;

  perfume.updatedBy = req.user._id;
  await perfume.save();

  return sendSuccess(res, { message: 'Stock updated', data: decorate(perfume.toObject()) });
});

/* ───────────────────────── Bulk stock top-up ─────────────────────────
 * The three calls behind the "Update stock" screen. Every one of them adds
 * grams to what is already on hand — an incoming delivery, never a final
 * reading — and none of them ever touches a file: the spreadsheet is read in
 * the browser and only the parsed rows are ever sent here.
 */

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

/**
 * One `$inc` that cannot drive stock below zero: a removal only matches a
 * perfume that still holds enough grams, so the guard is the query, not a
 * read-then-write that two admins can interleave.
 */
const incrementStock = (id, delta, userId) =>
  Perfume.findOneAndUpdate(
    delta < 0 ? { _id: id, stock: { $gte: -delta } } : { _id: id },
    { $inc: { stock: delta }, $set: { updatedBy: userId } },
    { new: true }
  )
    .select(`${STOCK_FIELDS} mrp discountPercent finalPrice sizeGrams hasVariants variants createdAt`)
    .lean();

/**
 * Type-ahead for the single stock update.
 *
 * With no search term it answers with what needs restocking — out of stock
 * first, then low — because that is the list an admin opens this screen to fix.
 * Archived perfumes are left out: they are not being sold, so they are not
 * being restocked.
 */
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

/**
 * Matches the names read out of an uploaded sheet against the catalogue.
 *
 * The whole catalogue is pulled once with a five-field projection and matched
 * in memory — a thousand-row sheet becomes one query rather than a thousand
 * regexes, and the catalogue at this size is a few hundred kilobytes.
 *
 * A name that matches two perfumes is reported as ambiguous rather than
 * guessed at: silently topping up the wrong bottle is worse than a flagged row.
 */
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

/**
 * Applies the reviewed sheet. Reads the targets once so every skipped row can
 * say why, then sends the survivors as a single unordered `bulkWrite` — one
 * round trip for a thousand perfumes, and each row still an atomic `$inc`.
 */
export const bulkAdjustStock = asyncHandler(async (req, res) => {
  const { items } = req.body;

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
        update: { $inc: { stock: delta }, $set: { updatedBy: req.user._id } },
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

/* ───────────────────────── Per-size repricing ─────────────────────────
 * The three calls behind the "Update price" screen. An admin sets a price for
 * whichever fills they want to change, and every other fill is left exactly as
 * it was — there is no derivation here, and no size moves because a different
 * size moved. See `utils/sizePricing.js` for why.
 *
 * None of them ever touches a file: a bulk sheet is read in the browser and
 * only the parsed names and per-size prices are sent here.
 */

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

/**
 * Type-ahead for the single repricing flow.
 *
 * There is no useful "needs attention" list to offer before anything is typed —
 * no perfume is ever overdue for a price change — so an empty term answers with
 * the catalogue in alphabetical order, which is somewhere to start browsing.
 */
export const searchPriceTargets = asyncHandler(async (req, res) => {
  const { q, limit } = req.query;

  const filter = { status: { $ne: 'archived' } };
  if (q) Object.assign(filter, buildPerfumeSearch(q));

  const perfumes = await Perfume.find(filter).select(PRICE_FIELDS).sort({ name: 1 }).limit(limit).lean();

  return sendSuccess(res, { message: 'Perfumes loaded', data: perfumes.map(priceOption) });
});

/**
 * Matches the names read out of an uploaded sheet against the catalogue.
 *
 * The same one-query, match-in-memory approach as `resolveStockNames`, and the
 * same refusal to guess: a name held by two perfumes is reported as ambiguous
 * rather than repriced at random.
 */
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

/**
 * Applies the reviewed prices — the one call in this trio that writes.
 *
 * A perfume's whole `variants` array is set in a single unordered `bulkWrite`:
 * one round trip for a thousand perfumes rather than a thousand saves. Only the
 * fills named in `prices` move; every other variant is written back byte for
 * byte, so a size the admin left blank keeps the price it had.
 *
 * Writing through `bulkWrite` skips the model's pre-save hook, so the derived
 * fields that hook maintains are computed here instead — `sellingPrice` per
 * variant, and the perfume's own `mrp`/`discountPercent`/`finalPrice`, which
 * mirror the cheapest active row the way the rest of the app expects.
 * `sizeGrams` is deliberately untouched: repricing never moves a fill size.
 */
export const bulkUpdatePrices = asyncHandler(async (req, res) => {
  const { items } = req.body;

  // The same perfume twice in one sheet is a contradiction, not an addition —
  // the last set of prices given wins, which is what correcting a row means.
  const merged = new Map();
  items.forEach(({ id, prices }) => merged.set(id, prices));

  const ids = [...merged.keys()];
  // The WHOLE variant rows, not the screen's projection: these are written back
  // verbatim below, and a projected row would silently drop each variant's
  // image, barcode, hsnCode and _id on save.
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

/* ───────────────────────── Bulk catalogue upload ─────────────────────────
 * Creating a whole catalogue from a spreadsheet, rather than a perfume at a
 * time through the wizard. The wizard is untouched: this is a second door to
 * the same collection, not a replacement for it.
 *
 * As with the stock and price sheets, the file never reaches the server. The
 * browser reads it, the admin reviews the rows, and only the reviewed values
 * are posted here.
 *
 * Two things are the server's alone to decide: the SKU each new perfume gets,
 * and whether its name is already taken. Both are answered twice — once for the
 * review screen (`previewBulkCreate`) and again, authoritatively, at the moment
 * of writing.
 */

/** Names already in the catalogue, as a Set of normalised keys. */
const takenNames = async () => {
  const rows = await Perfume.find().select('name').lean();
  return new Set(rows.map((row) => normaliseName(row.name)));
};

/**
 * What the review screen shows before anything is created: which sheet rows can
 * be created, and the SKU each one would get.
 *
 * The numbers here are a projection, not a reservation. Nothing is written, so
 * a perfume added by someone else in the meantime can shift them — which is why
 * the create below numbers the rows again itself rather than trusting these.
 */
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

/**
 * One reviewed row as a complete perfume document.
 *
 * Every field the wizard would have written is written here too, including the
 * ones the `pre('save')` hook normally derives — `insertMany` does not run save
 * middleware, and a catalogue whose slugs and selling prices were only
 * sometimes filled in would be a slow, quiet mess to find later.
 *
 * Sizes come straight from the sheet: a fill with no price in the file simply
 * does not become a variant. No price is ever worked out from another one.
 */
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
    images,
    hasVariants: true,
    variantAttributes: [
      { name: 'Size', selectorStyle: 'automatic', values: variants.map((variant) => variant.label) },
    ],
    variants,
    mrp: cheapest.mrp,
    discountPercent: 0,
    finalPrice: cheapest.sellingPrice,
    // A perfume cannot be published without an image — the same rule the wizard
    // and the status endpoint enforce — so a row with no photo lands as a draft
    // and waits for one rather than being rejected outright.
    status: images.length ? 'published' : 'draft',
    createdBy: userId,
    updatedBy: userId,
  };
};

/** Rows are written in batches so one enormous sheet is not one enormous write. */
const INSERT_BATCH = 200;

/**
 * Inserts the documents, returning what went in and which ones bounced.
 *
 * `ordered: false` means a rejected row does not stop the ones behind it, and
 * the write errors carry the index of each failure — that index is how a
 * duplicate SKU gets a second number below instead of being lost.
 */
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

/**
 * Creates the reviewed perfumes.
 *
 * The checks the preview ran are run again here rather than trusted: minutes
 * can pass on the review screen, and in that time another admin can add a
 * perfume with one of these names or take one of these numbers.
 */
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
