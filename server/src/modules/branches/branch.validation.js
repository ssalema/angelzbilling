import { z } from 'zod';
import {
  DEFAULT_DIAL_CODE,
  DEFAULT_COUNTRY,
  addContactNumberIssue,
  addPostalCodeIssue,
} from '../../utils/countries.js';

const addressSchema = z
  .object({
    line1: z.string().trim().max(200).optional().default(''),
    city: z.string().trim().max(80).optional().default(''),
    state: z.string().trim().max(80).optional().default(''),
    pincode: z.string().trim().max(12).optional().default(''),
    country: z.string().trim().max(80).optional().default(DEFAULT_COUNTRY),
  })
  .superRefine((address, ctx) => {
    addPostalCodeIssue(ctx, { country: address.country, value: address.pincode, path: ['pincode'] });
  });

/** Shared shape — create and update refine the same contact-number rule. */
const branchFields = z.object({
  name: z.string().trim().min(2, 'Branch name must be at least 2 characters').max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Branch code must be at least 2 characters')
    .max(10, 'Branch code cannot exceed 10 characters')
    .regex(/^[A-Z0-9-]+$/, 'Use letters, numbers and hyphens only'),
  address: addressSchema.optional().default({}),
  phone: z.string().trim().optional().default(''),
  phoneCountryCode: z.string().trim().optional().default(DEFAULT_DIAL_CODE),
  email: z.string().trim().toLowerCase().email('Enter a valid email').or(z.literal('')).optional().default(''),
  gstin: z.string().trim().toUpperCase().max(20).optional().default(''),
  isActive: z.boolean().optional().default(true),
  hasOwnLogo: z.boolean().optional().default(false),
});

const refineBranchContact = (data, ctx) =>
  addContactNumberIssue(ctx, {
    dial: data.phoneCountryCode,
    number: data.phone,
    path: ['phone'],
    required: false,
  });

export const createBranchSchema = branchFields.superRefine(refineBranchContact);

export const updateBranchSchema = branchFields.partial().superRefine(refineBranchContact);

export const listBranchQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  search: z.string().trim().max(100, 'Search term is too long').optional().default(''),
  status: z.enum(['all', 'active', 'inactive']).optional().default('all'),
  sort: z.string().optional().default('-createdAt'),
});
