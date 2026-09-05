/**
 * Seeds a working demo dataset: branches, accounts, a perfume catalogue with
 * size variants, store settings, and a few months of bills so every dashboard
 * widget has real aggregated data to show on first run.
 *
 *   npm run seed          — adds anything missing, keeps what exists
 *   npm run seed -- --fresh   — wipes the collections first
 */
import mongoose from 'mongoose';
import env from '../config/env.js';
import logger from '../config/logger.js';
import connectDB, { disconnectDB } from '../config/db.js';
import User from '../models/User.js';
import Branch from '../models/Branch.js';
import Perfume from '../models/Perfume.js';
import Bill from '../models/Bill.js';
import Counter from '../models/Counter.js';
import Settings from '../models/Settings.js';
import { buildBillItems, calculateTotals, generateBillNumber } from '../modules/bills/bill.service.js';

const FRESH = process.argv.includes('--fresh');

/**
 * This script writes accounts that can sign in, so it must never run against a
 * production database — a well-known demo password there is a free super admin
 * for anyone who has read this repository.
 */
if (env.isProd) {
  console.error(
    '\n[seed] Refusing to run with NODE_ENV=production.\n' +
      '[seed] This creates demo accounts with a shared password. Seed a dev database instead.\n'
  );
  process.exit(1);
}

/**
 * Demo super admin. The password comes from SEED_PASSWORD when set, so a shared
 * or public environment can be seeded without a password that is in the source.
 */
const SEED_PASSWORD = process.env.SEED_PASSWORD || 'Admin@1234';

const ADMIN = {
  name: 'Super Admin',
  email: 'superadmin@angelzperfume.com',
  password: SEED_PASSWORD,
  role: 'superadmin',
};

const BRANCHES = [
  {
    name: 'Angelz Perfume — Flagship Store',
    code: 'HQ',
    address: { line1: '12 Attar Lane, Chandni Chowk', city: 'New Delhi', state: 'Delhi', pincode: '110006' },
    phone: '9811001100',
    email: 'flagship@angelzperfume.com',
    isDefault: true,
  },
  {
    name: 'Angelz Perfume — Mumbai',
    code: 'MUM',
    address: { line1: '48 Linking Road, Bandra West', city: 'Mumbai', state: 'Maharashtra', pincode: '400050' },
    phone: '9820022200',
    email: 'mumbai@angelzperfume.com',
  },
  {
    name: 'Angelz Perfume — Hyderabad',
    code: 'HYD',
    address: { line1: '7 Charminar Road, Old City', city: 'Hyderabad', state: 'Telangana', pincode: '500002' },
    phone: '9848033300',
    email: 'hyderabad@angelzperfume.com',
  },
];

/** Larger fills cost less per gram — the multiplier curve reflects that. */
const SIZE_MULTIPLIER = { '25gm': 1, '50gm': 1.8, '100gm': 3.2, '250gm': 7.2, '500gm': 13, '1000gm': 24 };

const CATALOGUE = [
  {
    name: 'Royal Oud — Premium Attar',
    brand: 'Angel Signature',
    category: 'Attar',
    subCategory: 'Oud',
    fragranceFamily: 'Woody',
    concentration: 'Pure Attar',
    basePrice: 480,
    discountPercent: 12,
    sizes: ['25gm', '50gm', '100gm', '250gm'],
    shortDescription: 'A deep, resinous oud attar aged in sandalwood casks.',
    features: ['Alcohol free', 'Aged 12 months', 'Long lasting — 10 to 12 hours', 'Hand blended in small batches'],
  },
  {
    name: 'Mogra Blossom — Jasmine Attar',
    brand: 'Angel Signature',
    category: 'Attar',
    subCategory: 'Floral',
    fragranceFamily: 'Floral',
    concentration: 'Pure Attar',
    basePrice: 320,
    discountPercent: 10,
    sizes: ['25gm', '50gm', '100gm', '250gm', '500gm'],
    shortDescription: 'Fresh night-blooming jasmine picked at dawn.',
    features: ['Alcohol free', 'Steam distilled', 'Soft floral sillage'],
  },
  {
    name: 'Amber Noir — Eau de Parfum',
    brand: 'Angel Noir',
    category: 'Perfume',
    subCategory: 'Eau de Parfum',
    fragranceFamily: 'Oriental',
    concentration: 'EDP',
    basePrice: 640,
    discountPercent: 18,
    sizes: ['50gm', '100gm', '250gm'],
    shortDescription: 'Warm amber wrapped in vanilla and smoked cedar.',
    features: ['20% fragrance concentration', 'Unisex', 'Evening wear'],
  },
  {
    name: 'White Musk — Everyday Roll On',
    brand: 'Angel Daily',
    category: 'Roll On',
    subCategory: 'Musk',
    fragranceFamily: 'Musky',
    concentration: 'Roll On',
    basePrice: 180,
    discountPercent: 8,
    sizes: ['25gm', '50gm', '100gm'],
    shortDescription: 'Clean, powdery musk for daily wear.',
    features: ['Skin friendly', 'Pocket size', 'Non staining'],
  },
  {
    name: 'Kesar Chandan — Saffron Sandalwood',
    brand: 'Angel Heritage',
    category: 'Attar',
    subCategory: 'Sandalwood',
    fragranceFamily: 'Woody',
    concentration: 'Pure Attar',
    basePrice: 720,
    discountPercent: 15,
    sizes: ['25gm', '50gm', '100gm', '250gm', '500gm', '1000gm'],
    shortDescription: 'Kashmiri saffron threads infused into Mysore sandalwood oil.',
    features: ['Kashmiri saffron', 'Mysore sandalwood base', 'Traditional deg-bhapka method'],
  },
  {
    name: 'Rose Taifi — Bulgarian Rose Attar',
    brand: 'Angel Heritage',
    category: 'Attar',
    subCategory: 'Rose',
    fragranceFamily: 'Floral',
    concentration: 'Pure Attar',
    basePrice: 890,
    discountPercent: 20,
    sizes: ['25gm', '50gm', '100gm'],
    shortDescription: 'Ten thousand rose petals distilled into every tola.',
    features: ['Bulgarian Damask rose', 'Cold distilled', 'Collector grade'],
  },
  {
    name: 'Bakhoor Dukhni — Incense Blend',
    brand: 'Angel Home',
    category: 'Home Fragrance',
    subCategory: 'Bakhoor',
    fragranceFamily: 'Smoky',
    concentration: 'Incense',
    basePrice: 260,
    discountPercent: 0,
    sizes: ['50gm', '100gm', '250gm', '500gm'],
    shortDescription: 'Traditional Arabian bakhoor chips for home and prayer rooms.',
    features: ['Slow burning', 'Natural resins', 'Fills a room in minutes'],
  },
  {
    name: 'Citrus Verve — Summer Cologne',
    brand: 'Angel Daily',
    category: 'Perfume',
    subCategory: 'Cologne',
    fragranceFamily: 'Citrus',
    concentration: 'EDC',
    basePrice: 340,
    discountPercent: 25,
    sizes: ['50gm', '100gm', '250gm'],
    shortDescription: 'Bergamot, lime and neroli over a clean vetiver base.',
    features: ['Fresh and light', 'Great for daytime', 'Vegan formula'],
  },
];

const CUSTOMERS = [
  { name: 'Aarav Sharma', mobile: '9811234501' },
  { name: 'Fatima Sheikh', mobile: '9820234502' },
  { name: 'Rohan Mehta', mobile: '9848234503' },
  { name: 'Priya Nair', mobile: '9833234504' },
  { name: 'Imran Qureshi', mobile: '9811234505' },
  { name: 'Sneha Kulkarni', mobile: '9920234506' },
  { name: 'Vikram Rathore', mobile: '9871234507' },
  { name: 'Ananya Das', mobile: '9836234508' },
  { name: 'Kabir Malhotra', mobile: '9812234509' },
  { name: 'Zoya Khan', mobile: '9821234510' },
];

const PAYMENT_METHODS = ['cash', 'upi', 'card', 'bank_transfer'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const buildPerfume = (definition, index, createdBy) => {
  const skuBase = `AP-${String(index + 1).padStart(3, '0')}`;

  // A variant is size + price + SKU only. The weight it is poured from lives on
  // the perfume below, shared by every size.
  const variants = definition.sizes.map((size) => ({
    label: size,
    options: { Size: size },
    sku: `${skuBase}-${size.toUpperCase()}`,
    mrp: Math.round(definition.basePrice * SIZE_MULTIPLIER[size]),
    discountPercent: definition.discountPercent,
    isActive: true,
    hsnCode: '33030090',
  }));

  return {
    name: definition.name,
    sku: skuBase,
    brand: definition.brand,
    category: definition.category,
    subCategory: definition.subCategory,
    fragranceFamily: definition.fragranceFamily,
    concentration: definition.concentration,
    shortDescription: definition.shortDescription,
    description: `${definition.shortDescription} Blended and bottled by Angelz Perfume, this fragrance is offered in ${definition.sizes.length} fill sizes so you can try it before committing to a larger bottle.`,
    features: definition.features,
    faqs: [
      {
        question: 'How long does the fragrance last?',
        answer: 'Between 8 and 12 hours on skin, and noticeably longer on fabric.',
      },
      { question: 'Is it alcohol free?', answer: 'All Angelz Perfume attars are alcohol free and skin safe.' },
      { question: 'How should I store it?', answer: 'Keep the bottle sealed, away from direct sunlight and heat.' },
    ],
    mrp: Math.round(definition.basePrice * SIZE_MULTIPLIER[definition.sizes[0]]),
    discountPercent: definition.discountPercent,
    // The perfume's one bulk holding, in grams — 6 kg to 40 kg of juice, enough
    // for a few hundred bottles across whichever fills get sold.
    stock: randInt(6, 40) * 1000,
    lowStockThreshold: 2500, // grams
    images: [
      {
        // Deterministic placeholder art so the demo has visuals without a Cloudinary account.
        url: `https://picsum.photos/seed/angelzperfume${index + 1}/800/800`,
        publicId: '',
        alt: definition.name,
      },
    ],
    hasVariants: true,
    variantAttributes: [{ name: 'Size', selectorStyle: 'chip', values: definition.sizes }],
    variants,
    status: 'published',
    hsnCode: '33030090',
    tags: [definition.fragranceFamily.toLowerCase(), definition.category.toLowerCase(), 'perfume'],
    createdBy,
  };
};

const seedBills = async (perfumes, users, branches, count = 90) => {
  const sellable = perfumes.filter((p) => p.variants?.length);
  let created = 0;

  for (let i = 0; i < count; i += 1) {
    const staff = pick(users);
    const branchDoc = branches.find((b) => String(b._id) === String(staff.branch)) || branches[0];

    const lineCount = randInt(1, 3);
    const chosen = new Set();
    const items = [];

    for (let j = 0; j < lineCount; j += 1) {
      const perfume = pick(sellable);
      // Stock is on the perfume now, and buildBillItems re-reads it from the
      // database, so any size will do — a bill that overdraws is skipped below.
      const variant = pick(perfume.variants.filter((v) => v.isActive));
      if (!variant || chosen.has(String(variant._id))) continue;
      chosen.add(String(variant._id));
      items.push({ perfume: String(perfume._id), variantSku: variant.sku, quantity: randInt(1, 3) });
    }
    if (!items.length) continue;

    let built;
    try {
      built = await buildBillItems(items);
    } catch {
      continue; // stock ran out during seeding — skip this bill
    }

    const totals = calculateTotals(built.lines, { taxPercent: 0, extraDiscount: 0 });

    // Spread the bills across the last ~5 months so every date filter has data.
    const daysAgo = randInt(0, 150);
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - daysAgo);
    createdAt.setHours(randInt(10, 20), randInt(0, 59), 0, 0);

    const customer = pick(CUSTOMERS);
    const status = Math.random() > 0.94 ? 'refunded' : 'paid';

    // Seeded bills are backdated, so the number must be stamped from the bill's
    // own date — otherwise a March bill would print today's month and land in
    // the wrong financial year's sequence.
    const billNumber = await generateBillNumber({ prefix: 'AP', at: createdAt });

    await Bill.create({
      billNumber,
      customer: { ...customer, email: '', address: '', gstin: '' },
      items: built.lines,
      subtotal: totals.subtotal,
      totalDiscount: totals.totalDiscount,
      taxPercent: 0,
      taxAmount: 0,
      grandTotal: totals.grandTotal,
      amountPaid: totals.grandTotal,
      paymentMethod: pick(PAYMENT_METHODS),
      status,
      branch: {
        id: branchDoc._id,
        name: branchDoc.name,
        code: branchDoc.code,
        address: [branchDoc.address?.line1, branchDoc.address?.city].filter(Boolean).join(', '),
        phone: branchDoc.phone,
        gstin: branchDoc.gstin || '',
      },
      billedBy: { id: staff._id, name: staff.name, email: staff.email },
      notes: '',
      createdAt,
      updatedAt: createdAt,
    });

    if (status !== 'refunded') await Perfume.bulkWrite(built.stockOps);
    created += 1;
  }

  return created;
};

const run = async () => {
  await connectDB();

  if (FRESH) {
    logger.warn('--fresh flag detected: clearing users, branches, perfumes, bills, counters and settings');
    await Promise.all([
      User.deleteMany({}),
      Branch.deleteMany({}),
      Perfume.deleteMany({}),
      Bill.deleteMany({}),
      Counter.deleteMany({}),
      Settings.deleteMany({}),
    ]);
  }

  // ── Branches ──
  const branches = [];
  for (const definition of BRANCHES) {
    const branch = await Branch.findOneAndUpdate(
      { code: definition.code },
      { $setOnInsert: definition },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    branches.push(branch);
  }
  logger.info(`Branches ready: ${branches.map((b) => b.code).join(', ')}`);

  // ── Accounts ──
  let superAdmin = await User.findOne({ email: ADMIN.email });
  if (!superAdmin) {
    superAdmin = await User.create({
      name: ADMIN.name,
      email: ADMIN.email,
      password: ADMIN.password,
      role: ADMIN.role,
      branch: null,
      phone: '9800000000',
    });
    logger.info(`Super admin created: ${superAdmin.email}`);
  }

  const staffDefinitions = [
    { name: 'Nikhil Verma', email: 'delhi.admin@angelzperfume.com', role: 'admin', branch: branches[0]._id },
    { name: 'Meera Iyer', email: 'mumbai.admin@angelzperfume.com', role: 'admin', branch: branches[1]._id },
    { name: 'Sana Ali', email: 'hyderabad.admin@angelzperfume.com', role: 'admin', branch: branches[2]._id },
    { name: 'Rahul Yadav', email: 'delhi.billing@angelzperfume.com', role: 'staff', branch: branches[0]._id },
    { name: 'Deepa Rao', email: 'mumbai.billing@angelzperfume.com', role: 'staff', branch: branches[1]._id },
  ];

  const staff = [superAdmin];
  for (const definition of staffDefinitions) {
    let user = await User.findOne({ email: definition.email });
    if (!user) {
      user = await User.create({
        ...definition,
        password: ADMIN.password,
        phone: `98${randInt(10000000, 99999999)}`,
        createdBy: superAdmin._id,
      });
    }
    staff.push(user);
  }
  logger.info(`Accounts ready: ${staff.length}`);

  // ── Settings ──
  const settings = await Settings.getSingleton();
  if (!settings.contactEmail) {
    settings.set({
      siteName: 'Angelz Perfume',
      tagline: 'Hand blended attars and fine fragrance since 1994',
      contactEmail: 'care@angelzperfume.com',
      contactNumber: '9811001100',
      companyAddress: '12 Attar Lane, Chandni Chowk, New Delhi, Delhi 110006 (India)',
      social: {
        instagram: 'https://instagram.com/angelzperfume',
        facebook: 'https://facebook.com/angelzperfume',
      },
      billing: { billPrefix: 'AP', currencySymbol: '₹', defaultTaxPercent: 0 },
    });
    await settings.save();
    logger.info('Store settings seeded');
  }

  // ── Catalogue ──
  const perfumes = [];
  for (const [index, definition] of CATALOGUE.entries()) {
    const payload = buildPerfume(definition, index, superAdmin._id);
    let perfume = await Perfume.findOne({ sku: payload.sku });
    if (!perfume) perfume = await Perfume.create(payload);
    perfumes.push(perfume);
  }
  logger.info(`Perfumes ready: ${perfumes.length} (${perfumes.reduce((n, p) => n + p.variants.length, 0)} variants)`);

  // ── Bills ──
  const existingBills = await Bill.countDocuments();
  if (existingBills === 0) {
    const billers = staff.filter((u) => u.branch);
    const created = await seedBills(await Perfume.find(), billers, branches, 90);
    logger.info(`Bills seeded: ${created}`);
  } else {
    logger.info(`Bills already present (${existingBills}) — skipping`);
  }

  logger.info('');
  logger.info('─────────────────────────────────────────────');
  logger.info(' Seed complete. Sign in with:');
  logger.info(`   Super Admin : ${ADMIN.email}`);
  logger.info('   Branch Admin: delhi.admin@angelzperfume.com');
  logger.info('   Billing Staff: delhi.billing@angelzperfume.com');
  logger.info(
    process.env.SEED_PASSWORD
      ? '   Password    : the SEED_PASSWORD you set'
      : `   Password    : ${SEED_PASSWORD}  (dev default — set SEED_PASSWORD to change it)`
  );
  logger.info('   Change these before this database is reachable by anyone else.');
  logger.info('─────────────────────────────────────────────');

  await disconnectDB();
  process.exit(0);
};

run().catch(async (error) => {
  logger.error(`Seed failed: ${error.stack}`);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
