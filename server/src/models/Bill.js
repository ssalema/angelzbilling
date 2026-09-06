import mongoose from 'mongoose';

export const PAYMENT_METHODS = ['cash', 'card', 'upi', 'bank_transfer'];
/**
 * A bill is 'pending' while any part of it is still owed. It is not a draft —
 * the goods have already left the shelf and the stock is already deducted; only
 * the money is incomplete. Collecting the balance moves that same document to
 * 'paid', so a part payment never mints a second bill number.
 */
const BILL_STATUSES = ['paid', 'pending', 'refunded'];

const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
};

/**
 * Every line snapshots the perfume exactly as it was sold. A price change or a
 * perfume deletion tomorrow must not alter what this customer actually paid.
 */
const billItemSchema = new mongoose.Schema(
  {
    perfume: { type: mongoose.Schema.Types.ObjectId, ref: 'Perfume', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    perfumeName: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    variantSku: { type: String, default: '', trim: true },
    variantLabel: { type: String, default: '', trim: true },
    image: { type: String, default: '' },
    quantity: { type: Number, required: true, min: [1, 'Quantity must be at least 1'] },
    /** Fill size sold, and the grams this line actually removed from stock.
     *  Snapshotted like the price: if the catalogue is later re-sized, a refund
     *  must still put back exactly what was taken out. */
    sizeGrams: { type: Number, default: 0, min: 0 },
    gramsDeducted: { type: Number, default: 0, min: 0 },
    mrp: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    unitPrice: { type: Number, required: true, min: 0 }, // after discount
    lineTotal: { type: Number, required: true, min: 0 },
    hsnCode: { type: String, default: '' },
  },
  { _id: false }
);

/** Who did it and when — stamped from the session, never from the request body. */
const actorSchema = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    email: { type: String, default: '' },
  },
  { _id: false }
);

/**
 * One instalment of money actually received. The first entry is written when the
 * bill is raised; every later one is a balance collected against that same bill.
 * Together they always add up to `amountPaid`.
 */
const paymentEntrySchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    at: { type: Date, default: Date.now },
    by: { type: actorSchema, required: true },
    note: { type: String, trim: true, default: '', maxlength: 300 },
    /**
     * True only for the money taken as the bill was raised. The slip prints that
     * one as "During Billing" and stamps every later one with its own date, so this
     * cannot be inferred from position: a bill raised with nothing paid has no
     * billing-time entry at all, and its first collection is not one either.
     */
    atBilling: { type: Boolean, default: false },
  },
  { _id: true }
);

/** Every status transition, so "who marked this refunded, and when" has an answer. */
const statusEventSchema = new mongoose.Schema(
  {
    from: { type: String, default: '' },
    to: { type: String, required: true },
    at: { type: Date, default: Date.now },
    by: { type: actorSchema, required: true },
    note: { type: String, trim: true, default: '', maxlength: 300 },
  },
  { _id: true }
);

const billSchema = new mongoose.Schema(
  {
    billNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },

    customer: {
      name: { type: String, required: [true, 'Customer name is required'], trim: true, maxlength: 120 },
      // Digits only; how many of them is decided per country code by the
      // request validator, so a +65 number is 8 and a +91 number is 10.
      mobile: {
        type: String,
        required: [true, 'Customer contact number is required'],
        trim: true,
        match: [/^[0-9]{4,15}$/, 'Contact number must be digits only'],
        index: true,
      },
      mobileCountryCode: { type: String, trim: true, default: '+91' },
      email: { type: String, trim: true, lowercase: true, default: '' },
      address: { type: String, trim: true, default: '' },
      gstin: { type: String, trim: true, uppercase: true, default: '' },
    },

    items: {
      type: [billItemSchema],
      required: true,
      validate: [(v) => v.length > 0, 'A bill needs at least one item'],
    },

    subtotal: { type: Number, required: true, min: 0 }, // sum of mrp x qty
    totalDiscount: { type: Number, default: 0, min: 0 },
    taxPercent: { type: Number, default: 0, min: 0, max: 100 },
    taxAmount: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    /**
     * What is still owed. Stored rather than derived because outstanding money
     * is summed across bills in aggregations, and Mongo cannot group on a
     * virtual. Always `grandTotal - amountPaid`, and forced to 0 by a refund —
     * a bill whose money has been handed back is owed nothing.
     */
    amountDue: { type: Number, default: 0, min: 0, index: true },

    /** The audit trail: money in, and every status change. Append-only. */
    payments: { type: [paymentEntrySchema], default: [] },
    statusHistory: { type: [statusEventSchema], default: [] },

    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true, index: true },
    status: { type: String, enum: BILL_STATUSES, default: 'paid', index: true },

    // ── Snapshots: multi-branch reporting must survive renames and deletions ──
    branch: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
      name: { type: String, default: '' },
      code: { type: String, default: '' },
      address: { type: String, default: '' },
      phone: { type: String, default: '' },
      phoneCountryCode: { type: String, default: '+91' },
      gstin: { type: String, default: '' },
      logo: { type: String, default: '' }, // '' means the bill prints the store logo
    },
    billedBy: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
      name: { type: String, required: true },
      email: { type: String, default: '' },
    },

    notes: { type: String, trim: true, default: '', maxlength: 1000 },
    refundedAt: { type: Date, default: null },
    refundReason: { type: String, default: '' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

billSchema.index({ createdAt: -1 });
billSchema.index({ 'branch.id': 1, createdAt: -1 });
billSchema.index({ status: 1, createdAt: -1 });
/**
 * The bill list is nearly always branch-scoped AND status-filtered before it is
 * sorted by date, and a two-field index cannot serve all three. This is the
 * shape that screen actually asks for.
 */
billSchema.index({ 'branch.id': 1, status: 1, createdAt: -1 });
/**
 * `grandTotal` is offered as a sort column by the list endpoint but had no
 * index, so sorting by it loaded every matching bill and sorted them in memory
 * — which Mongo aborts outright once the set passes 32 MB. Every other sortable
 * column (createdAt, billNumber, status, amountDue) was already indexed; this
 * was the one that would have failed, and only once the shop got busy.
 */
billSchema.index({ grandTotal: -1 });
billSchema.index({ billNumber: 'text', 'customer.name': 'text', 'customer.mobile': 'text' });

billSchema.virtual('totalQuantity').get(function totalQuantity() {
  return this.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
});

billSchema.virtual('totalGrams').get(function totalGrams() {
  return this.items?.reduce((sum, item) => sum + (item.gramsDeducted || 0), 0) || 0;
});

billSchema.virtual('isFullyPaid').get(function isFullyPaid() {
  return Number(this.amountDue || 0) <= 0;
});

billSchema.virtual('paymentMethodLabel').get(function paymentMethodLabel() {
  return PAYMENT_METHOD_LABELS[this.paymentMethod] || this.paymentMethod;
});

/**
 * A refund gives the money back, so a refunded bill earns nothing. Everything
 * else counts — but revenue is what was *collected* (`amountPaid`), never what
 * was billed, so a part-paid bill contributes only the cash actually taken and
 * its balance stays outstanding rather than being booked early.
 */
billSchema.statics.revenueMatch = () => ({ status: { $ne: 'refunded' } });

export const Bill = mongoose.model('Bill', billSchema);
export default Bill;
