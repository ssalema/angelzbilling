import Perfume from '../../models/Perfume.js';
import Branch from '../../models/Branch.js';
import Counter from '../../models/Counter.js';
import { DEFAULT_BILL_PREFIX } from '../../models/Settings.js';
import ApiError from '../../utils/ApiError.js';
import { round2 } from '../../utils/query.js';
import { moneyFormatter } from '../../utils/money.js';
import { resolveSizeGrams, gramsForQuantity, unitsFromGrams, formatGrams } from '../../utils/grams.js';
import { toBranchId, toLocationId, isValidLocationId, HEAD_OFFICE_LABEL } from '../../utils/locations.js';

// Bill numbers look like AP260900001 — the store's bill prefix from Settings, then YY + MM + a 5 digit serial.
const financialYearKey = (date = new Date()) => {
  // getMonth() is 0-based, so 3 is April — the first month of the financial year.
  const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
};

export const generateBillNumber = async ({ prefix = DEFAULT_BILL_PREFIX, at = new Date() } = {}) => {
  const stamp = `${String(at.getFullYear()).slice(-2)}${String(at.getMonth() + 1).padStart(2, '0')}`;
  const key = `BILL-FY${financialYearKey(at)}`;
  const seq = await Counter.next(key);
  return `${prefix}${stamp}${String(seq).padStart(5, '0')}`;
};

// Turns the thin client payload into fully priced, fully snapshotted lines.
export const buildBillItems = async (items, { maxDiscountPercent = 100, canOverride = true } = {}) => {
  const discountCap = canOverride ? 100 : Math.max(0, Math.min(100, Number(maxDiscountPercent) || 0));

  const perfumeIds = [...new Set(items.map((i) => String(i.perfume)))];
  const perfumes = await Perfume.find({ _id: { $in: perfumeIds } });
  const perfumeMap = new Map(perfumes.map((p) => [String(p._id), p]));

  const lines = [];

  const remaining = new Map(perfumes.map((p) => [String(p._id), Number(p.stock) || 0]));
  const consumed = new Map();

  for (const [index, item] of items.entries()) {
    const perfume = perfumeMap.get(String(item.perfume));
    if (!perfume) throw ApiError.badRequest(`Item ${index + 1}: this perfume no longer exists`);
    if (perfume.status === 'archived') {
      throw ApiError.badRequest(`"${perfume.name}" is archived and cannot be billed`);
    }

    let variant = null;
    if (perfume.hasVariants) {
      variant = item.variantSku
        ? perfume.findVariantBySku(item.variantSku)
        : perfume.variants.id(item.variantId);
      if (!variant) {
        throw ApiError.badRequest(`Item ${index + 1}: choose a size for "${perfume.name}"`);
      }
      if (!variant.isActive) {
        throw ApiError.badRequest(`"${perfume.name} — ${variant.label}" is not available for sale`);
      }
    }

    // Stock is held as bulk grams, so a quantity of 2 on a 100gm fill needs 200 g.
    const sizeGrams = resolveSizeGrams(variant || perfume);
    const perfumeKey = String(perfume._id);
    const availableGrams = remaining.get(perfumeKey) ?? 0;
    const gramsNeeded = gramsForQuantity(item.quantity, sizeGrams);

    if (availableGrams < gramsNeeded) {
      const what = variant ? `${perfume.name} — ${variant.label}` : perfume.name;
      const sellable = unitsFromGrams(availableGrams, sizeGrams);
      throw ApiError.badRequest(
        sellable === 0
          ? `"${what}" is out of stock — only ${formatGrams(availableGrams)} of "${perfume.name}" left, and one unit needs ${formatGrams(sizeGrams)}`
          : `Only ${formatGrams(availableGrams)} of "${perfume.name}" left in stock — enough for ${sellable} × ${formatGrams(sizeGrams)}, not ${item.quantity}`
      );
    }

    remaining.set(perfumeKey, round2(availableGrams - gramsNeeded));
    consumed.set(perfumeKey, round2((consumed.get(perfumeKey) || 0) + gramsNeeded));

    const mrp = round2(variant ? variant.mrp : perfume.mrp);
    // A catalogue discount is the store's own decision and always stands; only
    // an override typed into the billing form is measured against the cap.
    const catalogueDiscount = Number(variant ? variant.discountPercent : perfume.discountPercent) || 0;
    const discountPercent =
      item.discountPercent !== undefined ? Number(item.discountPercent) : catalogueDiscount;

    if (discountPercent > Math.max(discountCap, catalogueDiscount)) {
      throw ApiError.forbidden(
        `Item ${index + 1}: a discount above ${discountCap}% needs a Branch Admin. ` +
          'Ask an admin to raise this bill, or lower the discount.'
      );
    }

    const unitPrice = round2(mrp * (1 - discountPercent / 100));
    const lineTotal = round2(unitPrice * item.quantity);

    lines.push({
      perfume: perfume._id,
      variantId: variant?._id || null,
      perfumeName: perfume.name,
      sku: perfume.sku,
      variantSku: variant?.sku || '',
      variantLabel: variant?.label || '',
      image: variant?.image?.url || perfume.images?.[0]?.url || '',
      quantity: item.quantity,
      sizeGrams,
      gramsDeducted: gramsNeeded,
      mrp,
      discountPercent,
      unitPrice,
      lineTotal,
      hsnCode: variant?.hsnCode || perfume.hsnCode || '',
    });
  }

  // One deduction per perfume, against its single stock field — a variant has no stock of its own to touch.
  const stockOps = [...consumed.entries()].map(([perfumeId, grams]) => ({
    updateOne: {
      filter: { _id: perfumeId, stock: { $gte: grams } },
      update: { $inc: { stock: -grams, stockMargin: -grams } },
    },
  }));

  return { lines, stockOps };
};

// Applies the guarded deductions and refuses the whole bill if any of them was beaten to the stock.
export const deductStock = async (stockOps, session = null) => {
  if (!stockOps.length) return;

  const options = session ? { session, ordered: false } : { ordered: false };
  const result = await Perfume.bulkWrite(stockOps, options);

  if (result.modifiedCount === stockOps.length) return;

  const ids = stockOps.map((op) => op.updateOne.filter._id);
  const current = await Perfume.find({ _id: { $in: ids } })
    .select('name stock')
    .session(session)
    .lean();
  const stockById = new Map(current.map((p) => [String(p._id), p]));

  const short = stockOps
    .filter((op) => {
      const perfume = stockById.get(String(op.updateOne.filter._id));
      return !perfume || perfume.stock < op.updateOne.filter.stock.$gte;
    })
    .map((op) => {
      const perfume = stockById.get(String(op.updateOne.filter._id));
      const needed = op.updateOne.filter.stock.$gte;
      return perfume
        ? `"${perfume.name}" (${formatGrams(needed)} needed, ${formatGrams(perfume.stock)} left)`
        : 'a perfume that no longer exists';
    });

  throw ApiError.conflict(
    `Stock ran out while this bill was being saved — ${short.join(', ')}. ` +
      'Someone else billed it first. Reload the stock and try again.'
  );
};

/** Single place where money is added up, so preview and save can never disagree. */
export const calculateTotals = (
  lines,
  {
    taxPercent = 0,
    extraDiscount = 0,
    maxDiscountPercent = 100,
    canOverride = true,
    formatMoney = moneyFormatter(),
  } = {}
) => {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.mrp * l.quantity, 0));
  const afterLineDiscounts = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
  const lineDiscount = round2(subtotal - afterLineDiscounts);

  // The whole-bill discount was capped only at "free", which is the same theft
  // the per-line cap closes. Staff get the store ceiling as a share of the bill.
  const ceiling = canOverride
    ? afterLineDiscounts
    : round2((afterLineDiscounts * Math.max(0, Math.min(100, Number(maxDiscountPercent) || 0))) / 100);

  if (round2(extraDiscount) > ceiling) {
    // Past the billable amount it is not a permission problem, it is arithmetic:
    // no one, admin included, can discount more than the bill is worth.
    if (round2(extraDiscount) > afterLineDiscounts) {
      throw ApiError.badRequest('The bill discount cannot be more than the amount being billed.');
    }
    // Named in money as well as percent: the field being refused is a cash
    // figure, and "20%" alone leaves the cashier to work out 20% of what.
    throw ApiError.forbidden(
      `A bill discount above ${formatMoney(ceiling)} (${maxDiscountPercent}% of this bill) ` +
        'needs a Branch Admin. Ask an admin to raise this bill, or lower the discount.'
    );
  }

  const cappedExtra = Math.min(round2(extraDiscount), ceiling);
  const taxable = round2(afterLineDiscounts - cappedExtra);
  const taxAmount = round2((taxable * Number(taxPercent || 0)) / 100);

  const grandTotal = round2(taxable + taxAmount);

  return {
    subtotal,
    totalDiscount: round2(lineDiscount + cappedExtra),
    extraDiscount: cappedExtra,
    taxPercent: Number(taxPercent || 0),
    taxAmount,
    grandTotal,
  };
};

// Resolves which location this bill belongs to.
export const resolveBillBranch = async (user, requestedBranchId, { enabled = true } = {}) => {
  if (!enabled) return null;

  const own = user.branch ? String(user.branch._id || user.branch) : null;
  const isHeadOfficeSuperAdmin = user.role === 'superadmin' && !own;

  if (!isHeadOfficeSuperAdmin) {
    if (requestedBranchId && toLocationId(requestedBranchId) !== toLocationId(own)) {
      throw ApiError.forbidden(
        `You can only raise bills for your own location — ${own ? 'your branch' : HEAD_OFFICE_LABEL}.`
      );
    }
    if (!own) return null; // Head Office staff bill under the main business
  } else if (requestedBranchId && !isValidLocationId(requestedBranchId)) {
    throw ApiError.badRequest(`"${requestedBranchId}" is not a valid location`);
  }

  const branchId = isHeadOfficeSuperAdmin ? toBranchId(requestedBranchId) : own;
  if (!branchId) return null;

  const branch = await Branch.findById(branchId);
  if (!branch) throw ApiError.badRequest('The selected branch does not exist');
  if (!branch.isActive) throw ApiError.badRequest(`Branch "${branch.name}" is inactive and cannot raise bills`);

  return {
    id: branch._id,
    name: branch.name,
    code: branch.code,
    address: [
      branch.address?.line1,
      branch.address?.city,
      branch.address?.state,
      branch.address?.pincode,
      branch.address?.country,
    ]
      .filter(Boolean)
      .join(', '),
    phone: branch.phone || '',
    phoneCountryCode: branch.phoneCountryCode || '+91',
    gstin: branch.gstin || '',
    // '' keeps the bill on the store logo; a branch logo is snapshotted like the rest.
    logo: branch.hasOwnLogo ? branch.logo?.url || '' : '',
  };
};
