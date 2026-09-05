import { z } from 'zod';
import { DEFAULT_DIAL_CODE, addContactNumberIssue } from '../../utils/countries.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const billItemSchema = z.object({
  perfume: objectId,
  variantId: objectId.nullable().optional(),
  variantSku: z.string().trim().optional().default(''),
  quantity: z.coerce.number().int('Quantity must be a whole number').min(1, 'Quantity must be at least 1'),
  /** Optional per-line override; the server still recomputes every total. */
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
    errorMap: () => ({ message: 'Choose a payment method' }),
  }),
  /**
   * Deliberately left without a default. Omitting the field means "use the
   * store's default tax", which the controller reads from Settings; defaulting
   * it to 0 here made that fallback unreachable, so a store configured for 18%
   * quietly billed everything at 0 whenever the client did not send the number.
   */
  taxPercent: z.coerce.number().min(0).max(100).optional(),
  /** Whole-bill discount in currency, applied after line discounts. */
  extraDiscount: z.coerce.number().min(0).optional().default(0),
  amountPaid: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(1000).optional().default(''),
  branch: objectId.optional(), // superadmin may bill on behalf of any branch
});

export const listBillQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().trim().max(100, 'Search term is too long').optional().default(''),
  status: z.enum(['all', 'paid', 'refunded']).optional().default('all'),
  paymentMethod: z
    .enum(['all', 'cash', 'card', 'upi', 'bank_transfer'])
    .optional()
    .default('all'),
  branch: z.string().optional().default(''),
  // Filtered on with `new ObjectId(...)`, so anything that is not an id (or the
  // "all" sentinel) has to be refused here rather than blow up in the driver.
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

export const idParamSchema = z.object({ id: objectId });

/**
 * Customer directory lookup. There is no Customer collection — a customer *is*
 * the set of bills raised against their number, so one of these is required:
 * `mobile` for an exact recall, `q` for the type-ahead suggestions.
 */
export const customerLookupQuerySchema = z
  .object({
    mobile: z.string().trim().regex(/^[0-9]*$/, 'Contact number must be digits only').max(15).optional().default(''),
    mobileCountryCode: z.string().trim().optional().default(DEFAULT_DIAL_CODE),
    // Three characters minimum: a one-letter `q` matches most of the book, which
    // turns a type-ahead into a way to page out every customer a branch has.
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
