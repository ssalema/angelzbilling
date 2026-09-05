/**
 * Imports the real catalogue — the rows of `data/perfumes name with size &
 * price.xlsx` transcribed into `perfumes.data.js` — into the perfume
 * collection, one document per perfume with a size variant for every priced
 * fill and the matching photo from `data/perfume media/`.
 *
 *   npm run import:perfumes                 — add what is missing, refresh prices
 *   npm run import:perfumes -- --force-media  — re-upload the pictures and re-point
 *                                               every row at them, replacing any
 *                                               photo added by hand
 *   npm run import:perfumes -- --skip-media   — text only, leave photos alone
 *   npm run import:perfumes -- --dry-run      — print the plan, write nothing
 *
 * Re-runnable: perfumes are matched on SKU and pictures go to a deterministic
 * Cloudinary public id, so a second run overwrites rather than duplicating.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

import env from '../config/env.js';
import logger from '../config/logger.js';
import connectDB, { disconnectDB } from '../config/db.js';
import { uploadBuffer } from '../config/cloudinary.js';
import Perfume from '../models/Perfume.js';
import User from '../models/User.js';
import { PERFUMES, SIZES } from './perfumes.data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** data/perfume media lives outside the server package, at the repository root. */
const MEDIA_DIR = path.resolve(__dirname, '../../../data/perfume media');

const FORCE_MEDIA = process.argv.includes('--force-media');
const SKIP_MEDIA = process.argv.includes('--skip-media');
const DRY_RUN = process.argv.includes('--dry-run');

/** Every perfume is stocked as 1000 g of bulk juice, as agreed for this import. */
const STOCK_GRAMS = 1000;
const LOW_STOCK_GRAMS = 100;

const SKU_PREFIX = 'AP';
/**
 * The catalogue already ran to AP-019 before this sheet arrived, so the import
 * numbers on from there rather than colliding with it. Bump this if more
 * perfumes are added by hand ahead of the next import.
 */
const SKU_START = 20;
const HSN_CODE = '33030090';
const CLOUDINARY_FOLDER = 'perfumes';

const skuFor = (index) => `${SKU_PREFIX}-${String(index + SKU_START).padStart(3, '0')}`;

/**
 * The catalogue is far larger than the picture set, so artwork is keyed on the
 * FILE rather than on the perfume: "7.png" is uploaded once, as
 * `perfumes/catalogue-07`, and every row that cycles onto it shares that one
 * asset instead of pushing a 45th copy of the same bytes.
 */
const publicIdForImage = (file) => `catalogue-${path.parse(file).name.padStart(2, '0')}`;

/** One upload per distinct picture per run, however many rows point at it. */
const uploadedImages = new Map();

const uploadCatalogueImage = async (file) => {
  if (uploadedImages.has(file)) return uploadedImages.get(file);

  const promise = (async () => {
    let buffer;
    try {
      buffer = await fs.readFile(path.join(MEDIA_DIR, file));
    } catch {
      logger.warn(`No artwork found at ${path.join(MEDIA_DIR, file)} — rows using it stay imageless`);
      return null;
    }

    if (DRY_RUN) return { url: `dry-run://${file}`, publicId: '' };

    const asset = await uploadBuffer(buffer, {
      folder: CLOUDINARY_FOLDER,
      resourceType: 'image',
      publicId: publicIdForImage(file),
    });
    logger.info(`Uploaded ${file} → ${asset.publicId}`);
    return { url: asset.url, publicId: asset.publicId };
  })();

  uploadedImages.set(file, promise);
  return promise;
};

/**
 * The media entry for a row.
 *
 * `publicId` is deliberately left blank on the perfume. Deleting a perfume, or
 * swapping its picture in the admin, destroys the Cloudinary asset behind the
 * id stored here — which would blank the artwork on all ~45 other perfumes
 * sharing that file. Storing the URL alone means no single perfume owns the
 * shared picture; the import is what manages those assets. A photograph
 * uploaded through the admin carries its own id and is left untouched.
 */
const resolveImage = async (definition, existing) => {
  if (SKIP_MEDIA) return existing?.images?.[0] || null;

  const current = existing?.images?.[0];
  if (current?.url && !FORCE_MEDIA) return current;

  const asset = await uploadCatalogueImage(definition.image);
  if (!asset) return null;

  return { url: asset.url, publicId: '', alt: definition.name };
};

/**
 * One variant per fill the sheet prices. A variant carries size, price and SKU
 * only — the weight it is poured from is the perfume's single `stock` pool.
 */
const buildVariants = (definition, sku) =>
  SIZES.filter((size) => Number.isFinite(definition.prices?.[size])).map((size) => ({
    label: size,
    options: { Size: size },
    sku: `${sku}-${size.toUpperCase()}`,
    mrp: definition.prices[size],
    discountPercent: 0,
    isActive: true,
    hsnCode: HSN_CODE,
  }));

const buildPayload = (definition, index, createdBy) => {
  const sku = skuFor(index);
  const variants = buildVariants(definition, sku);
  const sizes = variants.map((v) => v.label);

  return {
    sku,
    sizes,
    doc: {
      name: definition.name,
      sku,
      category: 'Perfume',
      concentration: 'Attar',
      // The sheet prices each fill from the same bulk juice, so the base price
      // mirrors the smallest fill — the "from" price a perfume is read at when
      // its variants are not loaded.
      mrp: variants[0]?.mrp ?? 0,
      discountPercent: 0,
      stock: STOCK_GRAMS,
      lowStockThreshold: LOW_STOCK_GRAMS,
      hasVariants: true,
      variantAttributes: [{ name: 'Size', selectorStyle: 'chip', values: sizes }],
      variants,
      status: 'published',
      hsnCode: HSN_CODE,
      createdBy,
    },
  };
};

const run = async () => {
  if (!PERFUMES.length) {
    logger.error('perfumes.data.js is empty — nothing to import');
    process.exit(1);
  }

  if (!DRY_RUN && !SKIP_MEDIA && !env.cloudinary.enabled) {
    logger.error(
      'Cloudinary is not configured, so the perfume photos cannot be uploaded. ' +
        'Add CLOUDINARY_* to server/.env, or re-run with --skip-media.'
    );
    process.exit(1);
  }

  await connectDB();

  const owner = await User.findOne({ role: 'superadmin' }).select('_id').lean();
  if (!owner) logger.warn('No superadmin found — importing perfumes with no createdBy');

  let created = 0;
  let updated = 0;

  for (const [index, definition] of PERFUMES.entries()) {
    const { sku, sizes, doc } = buildPayload(definition, index, owner?._id ?? null);

    if (!sizes.length) {
      logger.warn(`"${definition.name}" has no priced sizes on the sheet — skipped`);
      continue;
    }

    const existing = await Perfume.findOne({ sku });
    const image = await resolveImage(definition, existing);

    if (DRY_RUN) {
      // Every row at this size would be pages of noise — show the ends and a
      // sample of the middle, which is enough to check the numbering.
      if (index < 3 || index >= PERFUMES.length - 3 || index % 100 === 0) {
        logger.info(
          `[dry-run] ${existing ? 'update' : 'create'} ${sku} — ${definition.name} ` +
            `(${sizes.length} sizes, ₹${doc.variants[0].mrp}–₹${doc.variants.at(-1).mrp}, ${definition.image})`
        );
      }
      continue;
    }

    const perfume = existing || new Perfume();
    perfume.set({ ...doc, updatedBy: owner?._id ?? null });
    // Only the import owns the artwork slot; leave a hand-picked second image
    // alone if someone added one in the admin.
    if (image) perfume.images = [image, ...(perfume.images || []).slice(1)];
    if (existing) perfume.createdBy = existing.createdBy ?? owner?._id ?? null;
    await perfume.save();

    if (existing) updated += 1;
    else created += 1;

    // The catalogue runs to the high hundreds, so a silent several-minute run
    // is indistinguishable from a hung one.
    const done = created + updated;
    if (done % 100 === 0) logger.info(`  … ${done} / ${PERFUMES.length} perfumes written`);
  }

  const totalVariants = PERFUMES.reduce(
    (n, p) => n + SIZES.filter((s) => Number.isFinite(p.prices?.[s])).length,
    0
  );

  logger.info('');
  logger.info('─────────────────────────────────────────────');
  logger.info(
    DRY_RUN
      ? ` Dry run: ${PERFUMES.length} perfumes / ${totalVariants} variants would be written.`
      : ` Import complete — ${created} created, ${updated} updated (${totalVariants} variants).`
  );
  logger.info(`   Stock set to ${STOCK_GRAMS} gm per perfume, low stock alert at ${LOW_STOCK_GRAMS} gm.`);
  if (SKIP_MEDIA) logger.info('   Photos were skipped — re-run with --force-media to attach them.');
  logger.info('─────────────────────────────────────────────');

  await disconnectDB();
  process.exit(0);
};

run().catch(async (error) => {
  logger.error(`Perfume import failed: ${error.stack}`);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
