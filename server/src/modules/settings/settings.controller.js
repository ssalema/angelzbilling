import { z } from 'zod';
import { DEFAULT_DIAL_CODE, addContactNumberIssue } from '../../utils/countries.js';
import Settings from '../../models/Settings.js';
import Branch from '../../models/Branch.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import { uploadBuffer, destroyAsset } from '../../config/cloudinary.js';
import { refreshFeatures } from '../../utils/featureFlags.js';

const urlOrEmpty = (host) =>
  z
    .string()
    .trim()
    .url(`Enter a valid ${host} URL`)
    .or(z.literal(''))
    .optional();

export const updateSettingsSchema = z.object({
  siteName: z.string().trim().min(2, 'Store name must be at least 2 characters').max(120).optional(),
  tagline: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().toLowerCase().email('Enter a valid email').or(z.literal('')).optional(),
  contactNumber: z.string().trim().optional(),
  contactNumberCountryCode: z.string().trim().optional(),
  companyAddress: z.string().trim().max(500).optional(),
  gstin: z.string().trim().toUpperCase().max(20).optional(),
  features: z
    .object({
      branches: z.boolean().optional(),
    })
    .optional(),
  social: z
    .object({
      instagram: urlOrEmpty('Instagram'),
      facebook: urlOrEmpty('Facebook'),
      twitter: urlOrEmpty('X (Twitter)'),
      linkedin: urlOrEmpty('LinkedIn'),
    })
    .optional(),
  billing: z
    .object({
      currency: z.string().trim().max(8).optional(),
      currencySymbol: z.string().trim().max(4).optional(),
      billPrefix: z
        .string()
        .trim()
        .toUpperCase()
        .min(1)
        .max(6)
        .regex(/^[A-Z0-9]+$/, 'Use letters and numbers only')
        .optional(),
      defaultTaxPercent: z.coerce.number().min(0).max(100).optional(),
      maxDiscountPercent: z.coerce.number().min(0).max(100).optional(),
      invoiceFooter: z.string().trim().max(300).optional(),
      termsAndConditions: z.string().trim().max(2000).optional(),
    })
    .optional(),
})
  .superRefine((data, ctx) => {
    // The store contact number is optional, but if given it must fit its code.
    if (data.contactNumber === undefined) return;
    addContactNumberIssue(ctx, {
      dial: data.contactNumberCountryCode || DEFAULT_DIAL_CODE,
      number: data.contactNumber,
      path: ['contactNumber'],
      required: false,
    });
  });

/**
 * Mongoose Map keys may not contain "." or "$", so the audit map stores
 * `social:instagram` rather than `social.instagram`. The client un-escapes it.
 */
const auditKey = (path) => path.replace(/\./g, ':');

/**
 * The form PATCHes every field on save, so compare before writing: only a value
 * that actually changed earns a fresh audit stamp, otherwise a single edit would
 * re-date the whole tab.
 */
const isUnchanged = (current, next) => {
  if (current === next) return true;
  if (current === undefined || current === null) return next === '' || next === null;
  if (typeof current === 'number' || typeof next === 'number') return Number(current) === Number(next);
  return String(current) === String(next);
};

/** Deep merge so a partial PATCH never wipes a sibling nested field. */
const applyPatch = (doc, patch, prefix = '') => {
  Object.entries(patch).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      applyPatch(doc, value, path);
    } else if (value !== undefined) {
      if (isUnchanged(doc.get(path), value)) return;
      doc.set(path, value);
      doc.updatedFields.set(auditKey(path), new Date()); // powers the "Never updated" hints
    }
  });
};

export const getSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.getSingleton();
  return sendSuccess(res, { message: 'Settings loaded', data: settings });
});

/** Public-ish subset the login screen and print header need before auth. */
export const getPublicSettings = asyncHandler(async (_req, res) => {
  const settings = await Settings.getSingleton();
  return sendSuccess(res, {
    message: 'Store profile loaded',
    data: {
      siteName: settings.siteName,
      tagline: settings.tagline,
      logo: settings.branding?.logo?.url || '',
      favicon: settings.branding?.favicon?.url || '',
      currencySymbol: settings.billing?.currencySymbol || '₹',
      features: { branches: settings.features?.branches !== false },
    },
  });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.getSingleton();

  // Switching branch management off deactivates every branch rather than deleting
  // anything — bills and staff keep pointing at records that still exist. The flag
  // remembers which branches the switch closed so switching it back on restores
  // exactly those, leaving branches an admin deactivated by hand untouched.
  const nextBranches = req.body.features?.branches;
  const currentBranches = settings.features?.branches !== false;
  if (nextBranches === false && currentBranches) {
    await Branch.updateMany({ isActive: true }, { $set: { isActive: false, deactivatedByFeature: true } });
  } else if (nextBranches === true && !currentBranches) {
    await Branch.updateMany(
      { deactivatedByFeature: true },
      { $set: { isActive: true, deactivatedByFeature: false } }
    );
  }

  applyPatch(settings, req.body);
  settings.updatedBy = req.user._id;
  await settings.save();

  // Branch scoping is decided from a cached copy of this flag; drop it now so
  // the very next request already sees the switch in its new position.
  refreshFeatures();

  return sendSuccess(res, { message: 'Settings saved', data: settings });
});

export const uploadBranding = asyncHandler(async (req, res) => {
  const kind = req.params.kind; // 'logo' | 'favicon'
  if (!['logo', 'favicon'].includes(kind)) throw ApiError.badRequest('Upload either a logo or a favicon');
  if (!req.file) throw ApiError.badRequest('Choose an image to upload');
  if (!req.file.mimetype.startsWith('image/')) throw ApiError.badRequest('Branding must be an image file');

  const settings = await Settings.getSingleton();
  const previous = settings.branding?.[kind]?.publicId;

  const asset = await uploadBuffer(req.file.buffer, { folder: 'branding', resourceType: 'image' });

  settings.set(`branding.${kind}`, { url: asset.url, publicId: asset.publicId });
  settings.updatedFields.set(auditKey(`branding.${kind}`), new Date());
  settings.updatedBy = req.user._id;
  await settings.save();

  if (previous && previous !== asset.publicId) await destroyAsset(previous, 'image');

  return sendSuccess(res, {
    message: `${kind === 'logo' ? 'Logo' : 'Favicon'} updated`,
    data: settings,
  });
});

export const removeBranding = asyncHandler(async (req, res) => {
  const kind = req.params.kind;
  if (!['logo', 'favicon'].includes(kind)) throw ApiError.badRequest('Unknown branding asset');

  const settings = await Settings.getSingleton();
  const publicId = settings.branding?.[kind]?.publicId;

  settings.set(`branding.${kind}`, { url: '', publicId: '' });
  // Back to the default (no artwork), so the audit stamp goes with it — the
  // panel reads these keys to decide whether branding has been edited at all.
  settings.updatedFields.delete(auditKey(`branding.${kind}`));
  settings.updatedBy = req.user._id;
  await settings.save();

  if (publicId) await destroyAsset(publicId, 'image');

  return sendSuccess(res, { message: `${kind === 'logo' ? 'Logo' : 'Favicon'} removed`, data: settings });
});
