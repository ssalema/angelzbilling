import { z } from 'zod';
import { DEFAULT_DIAL_CODE, addContactNumberIssue } from '../../utils/countries.js';
import { formatGrams } from '../../utils/format.js';

/** Mirrors the server contract; the server re-prices every line regardless. */
export const billSchema = z.object({
  customer: z
    .object({
      name: z.string().trim().min(2, 'Customer name is required').max(120),
      mobile: z.string().trim().default(''),
      mobileCountryCode: z.string().trim().default(DEFAULT_DIAL_CODE),
      email: z.string().trim().email('Enter a valid email').or(z.literal('')).default(''),
      address: z.string().trim().max(300).default(''),
      gstin: z.string().trim().max(20).default(''),
    })
    .superRefine((customer, ctx) =>
      addContactNumberIssue(ctx, {
        dial: customer.mobileCountryCode,
        number: customer.mobile,
        path: ['mobile'],
      })
    ),

  items: z
    .array(
      z.object({
        perfume: z.string().min(1),
        variantId: z.string().nullable().default(null),
        variantSku: z.string().default(''),
        // Display-only fields, stripped before the request is sent.
        name: z.string().default(''),
        label: z.string().default(''),
        sku: z.string().default(''),
        image: z.string().default(''),
        // Stock is bulk grams, so the cap on quantity is a weight budget:
        // quantity x sizeGrams must fit inside availableGrams.
        availableGrams: z.number().default(0),
        sizeGrams: z.number().default(1),
        mrp: z.coerce.number().min(0),
        quantity: z.coerce
          .number()
          .int('Whole numbers only')
          .min(1, 'Quantity must be at least 1'),
        discountPercent: z.coerce.number().min(0, 'Cannot be negative').max(100, 'Cannot exceed 100%').default(0),
      })
    )
    .min(1, 'Add at least one perfume to the bill')
    .superRefine((items, ctx) => {
      items.forEach((item, index) => {
        const perUnit = Number(item.sizeGrams) > 0 ? Number(item.sizeGrams) : 1;
        const sellable = Math.floor(Math.max(0, Number(item.availableGrams) || 0) / perUnit);
        if (item.quantity > sellable) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, 'quantity'],
            message: sellable === 0 ? 'Out of stock' : `Only ${sellable} left (${formatGrams(item.availableGrams)})`,
          });
        }
      });
    }),

  paymentMethod: z.enum(['cash', 'card', 'upi', 'bank_transfer'], {
    errorMap: () => ({ message: 'Choose a payment method' }),
  }),
  taxPercent: z.coerce.number().min(0).max(100).default(0),
  extraDiscount: z.coerce.number().min(0, 'Cannot be negative').default(0),

  /**
   * Full Paid or Partial Paid. Only the amount is different — the bill itself
   * is identical either way, which is why this never reaches the server: it
   * sends `amountPaid` and the server decides the status from the total it
   * computed itself.
   */
  paymentTerm: z.enum(['full', 'partial']).default('full'),
  amountPaid: z.coerce.number().min(0, 'Cannot be negative').default(0),

  notes: z.string().trim().max(1000).default(''),
  branch: z.string().optional(),
}).superRefine((values, ctx) => {
  // A part payment is checked against the bill it is paying, so this has to sit
  // at the object level where the items and the tax are both in hand.
  if (values.paymentTerm !== 'partial') return;

  const { grandTotal } = calculateTotals(values.items || [], {
    taxPercent: values.taxPercent,
    extraDiscount: values.extraDiscount,
  });
  const received = Number(values.amountPaid) || 0;

  if (received > grandTotal) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['amountPaid'],
      message: 'Cannot be more than the total payable',
    });
  }
  // Paying the whole thing is Full Paid. Letting it through as "partial" would
  // save a bill that is settled but carries the pending status forever.
  if (received === grandTotal && grandTotal > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['amountPaid'],
      message: 'That is the full amount — choose Full Paid instead',
    });
  }
});

export const emptyBill = {
  customer: {
    name: '',
    mobile: '',
    mobileCountryCode: DEFAULT_DIAL_CODE,
    email: '',
    address: '',
    gstin: '',
  },
  items: [],
  paymentMethod: 'cash',
  taxPercent: 0,
  extraDiscount: 0,
  paymentTerm: 'full',
  amountPaid: 0,
  notes: '',
};

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

/**
 * Same arithmetic as the server's calculateTotals, so the live preview never
 * disagrees with the saved bill.
 */
export const calculateTotals = (items = [], { taxPercent = 0, extraDiscount = 0 } = {}) => {
  const lines = items.map((item) => {
    const mrp = Number(item.mrp) || 0;
    const quantity = Number(item.quantity) || 0;
    const discountPercent = Number(item.discountPercent) || 0;
    const unitPrice = round2(mrp * (1 - discountPercent / 100));
    return { ...item, unitPrice, lineTotal: round2(unitPrice * quantity) };
  });

  const subtotal = round2(lines.reduce((sum, l) => sum + l.mrp * l.quantity, 0));
  const afterLineDiscounts = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
  const lineDiscount = round2(subtotal - afterLineDiscounts);

  const cappedExtra = Math.min(round2(extraDiscount), afterLineDiscounts);
  const taxable = round2(afterLineDiscounts - cappedExtra);
  const taxAmount = round2((taxable * Number(taxPercent || 0)) / 100);

  const grandTotal = round2(taxable + taxAmount);

  return {
    lines,
    subtotal,
    lineDiscount,
    extraDiscount: cappedExtra,
    totalDiscount: round2(lineDiscount + cappedExtra),
    taxPercent: Number(taxPercent || 0),
    taxAmount,
    grandTotal,
    totalQuantity: lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0),
  };
};
