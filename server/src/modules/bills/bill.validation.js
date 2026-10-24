import { z } from 'zod';
import { DEFAULT_DIAL_CODE, addContactNumberIssue } from '../../utils/countries.js';
import { HEAD_OFFICE_ID } from '../../utils/locations.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const billItemSchema = z.object({
  perfume: objectId,
  variantId: objectId.nullable().optional(),
  variantSku: z.string().trim().optional().default(''),
  quantity: z.coerce.number().int('Quantity must be a whole number').min(1, 'Quantity must be at least 1'),
  // Optional per-line override; the server still recomputes every total.
  discountPercent: z.coerce.number().min(0).max(100, 'Discount cannot exceed 100%').optional(),
});

export const createBillSchema = z.object({
  customer: z
    .object({
      name: z.string().trim().min(2, 'Customer name must be at least 2 characters').max(120),
      mobile: z.string().trim().default(''),
      mobileCountryCode: z.string().trim().optional().default(DEFAULT_DIAL_CODE),
      email: z.string().trim().toLowerCase().email('Enter a valid email').or(z.literal('')).optional().default(''),
      address: z.string().trim().max(300).optional().default(''),
      gstin: z.string().trim().toUpperCase().max(20).optional().default(''),
    })
    .superRefine((customer, ctx) =>
      addContactNumberIssue(ctx, {
        dial: customer.mobileCountryCode,
        number: customer.mobile,
        path: ['mobile'],
      })
    ),
  items: z.array(billItemSchema).min(1, 'Add at least one perfume to the bill'),
  paymentMethod: z.enum(['cash', 'card', 'upi', 'bank_transfer'], {
    error: 'Choose a payment method',
  }),
  // No default on purpose.
  taxPercent: z.coerce.number().min(0).max(100).optional(),
  // Whole-bill discount in money, applied after line discounts.
  extraDiscount: z.coerce.number().min(0).optional().default(0),
  // Amount paid now.
  amountPaid: z.coerce.number().min(0, 'Amount received cannot be negative').optional(),
  notes: z.string().trim().max(1000).optional().default(''),
  // Only the Head Office Super Admin may set this; others are locked to their own branch.
  branch: z.union([objectId, z.literal(HEAD_OFFICE_ID)]).nullable().optional(),
});

export const listBillQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().trim().max(100, 'Search term is too long').optional().default(''),
  status: z.enum(['all', 'paid', 'pending', 'refunded']).optional().default('all'),
  paymentMethod: z
    .enum(['all', 'cash', 'card', 'upi', 'bank_transfer'])
    .optional()
    .default('all'),
  branch: z.string().optional().default(''),
  // Must be a valid id or "all", since it is passed to `new ObjectId(...)`.
  billedBy: z
    .string()
    .optional()
    .default('')
    .refine((value) => !value || value === 'all' || /^[a-f\d]{24}$/i.test(value), 'Invalid staff id'),
  range: z.enum(['today', 'week', 'month', 'year', 'all', 'custom']).optional().default('all'),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.string().optional().default('-createdAt'),
});

export const updateStatusSchema = z.object({
  status: z.literal('refunded'),
  reason: z.string().trim().max(300).optional().default(''),
});

// Collecting the balance on a pending bill.
export const collectPaymentSchema = z.object({
  amount: z.coerce
    .number({ error: (issue) => (issue.code === 'invalid_type' ? 'Enter the amount received' : undefined) })
    .positive('Enter an amount greater than zero'),
  // Defaults to the bill's original method (set in the controller).
  method: z.enum(['cash', 'card', 'upi', 'bank_transfer']).optional(),
  note: z.string().trim().max(300).optional().default(''),
});

export const idParamSchema = z.object({ id: objectId });

export const customerLookupQuerySchema = z
  .object({
    mobile: z.string().trim().regex(/^[0-9]*$/, 'Contact number must be digits only').max(15).optional().default(''),
    mobileCountryCode: z.string().trim().optional().default(DEFAULT_DIAL_CODE),
    // Min 3 chars so short searches can't be used to dump the customer list.
    q: z
      .string()
      .trim()
      .max(120)
      .optional()
      .default('')
      .refine((value) => !value || value.length >= 3, {
        message: 'Type at least 3 characters to search',
      }),
    limit: z.coerce.number().int().min(1).max(20).optional().default(8),
    branch: z.string().optional(),
  })
  .refine((value) => value.mobile || value.q, {
    message: 'Enter a contact number or a name to search',
    path: ['mobile'],
  });
