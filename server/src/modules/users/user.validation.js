import { z } from 'zod';
import { DEFAULT_DIAL_CODE, addContactNumberIssue } from '../../utils/countries.js';
import { passwordRule } from '../auth/auth.validation.js';
import { HEAD_OFFICE_ID } from '../../utils/locations.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const baseUser = {
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  phone: z.string().trim().optional().default(''),
  phoneCountryCode: z.string().trim().optional().default(DEFAULT_DIAL_CODE),
  role: z.enum(['superadmin', 'admin', 'staff'], { errorMap: () => ({ message: 'Choose a valid role' }) }),
  // A branch id, or the Head Office — the main business is a location too, and
  // null on the wire means exactly that.
  branch: z.union([objectId, z.literal(HEAD_OFFICE_ID)]).nullable().optional(),
  isActive: z.boolean().optional().default(true),
};

const requireBranchForScopedRoles = (data, ctx) => {
  if (data.role && data.role !== 'superadmin' && data.branch === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['branch'],
      message: 'Choose a location for Branch Admin and Billing Staff accounts',
    });
  }
  addContactNumberIssue(ctx, {
    dial: data.phoneCountryCode,
    number: data.phone,
    path: ['phone'],
    required: false,
  });
};

export const createUserSchema = z
  .object({ ...baseUser, password: passwordRule })
  .superRefine(requireBranchForScopedRoles);

export const updateUserSchema = z
  .object({
    name: baseUser.name.optional(),
    email: baseUser.email.optional(),
    // No `.default('')` here, unlike the create schema.
    phone: z.string().trim().optional(),
    phoneCountryCode: z.string().trim().optional(),
    role: baseUser.role.optional(),
    branch: baseUser.branch,
    isActive: z.boolean().optional(),
  })
  .superRefine(requireBranchForScopedRoles);

export const resetPasswordSchema = z.object({ password: passwordRule });

export const listUserQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().trim().max(100, 'Search term is too long').optional().default(''),
  role: z.enum(['all', 'superadmin', 'admin', 'staff']).optional().default('all'),
  status: z.enum(['all', 'active', 'inactive']).optional().default('all'),
  branch: z.string().optional().default(''),
  sort: z.string().optional().default('-createdAt'),
});

export const idParamSchema = z.object({ id: objectId });
