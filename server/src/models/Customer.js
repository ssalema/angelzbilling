import mongoose from 'mongoose';

// One row per person ever billed, kept up to date on each bill write.

// Branches where the customer was billed, with the first visit at each.
const seenAtSchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    firstSeenAt: { type: Date, required: true },
  },
  { _id: false }
);

const customerSchema = new mongoose.Schema(
  {
    /** `${mobileCountryCode}${mobile}` */
    _id: { type: String, required: true },

    mobile: { type: String, required: true },
    mobileCountryCode: { type: String, default: '+91' },
    /** Name from their most recent bill. */
    name: { type: String, default: '' },

    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },

    branches: { type: [seenAtSchema], default: [] },
  },
  { versionKey: false, timestamps: true }
);

/** New customers in a date range, store-wide. */
customerSchema.index({ firstSeenAt: 1 });
/** Same, per branch (multikey index). */
customerSchema.index({ 'branches.branch': 1, 'branches.firstSeenAt': 1 });

customerSchema.statics.recordBill = async function recordBill(bill, session = null) {
  const mobile = String(bill.customer?.mobile || '').trim();
  if (!mobile) return null;

  const code = bill.customer?.mobileCountryCode || '+91';
  const key = `${code}${mobile}`;
  const at = bill.createdAt || new Date();
  const branch = bill.branch?.id ?? null;
  const options = session ? { session } : {};

  await this.updateOne(
    { _id: key },
    {
      $min: { firstSeenAt: at },
      $max: { lastSeenAt: at },
      $set: { mobile, mobileCountryCode: code, name: bill.customer?.name || '' },
    },
    { upsert: true, ...options }
  );

  // Add the branch entry only on their first visit there.
  await this.updateOne(
    { _id: key, branches: { $not: { $elemMatch: { branch } } } },
    { $push: { branches: { branch, firstSeenAt: at } } },
    options
  );

  return key;
};

// Rebuilds a customer's row from their remaining (non-refunded) bills.
customerSchema.statics.reconcile = async function reconcile({ mobile, mobileCountryCode = '+91' }) {
  const number = String(mobile || '').trim();
  if (!number) return null;

  const key = `${mobileCountryCode}${number}`;
  const Bill = mongoose.model('Bill');

  const rows = await Bill.aggregate([
    {
      $match: {
        'customer.mobile': number,
        // Bills from before country codes existed count as +91.
        ...(mobileCountryCode === '+91'
          ? { $or: [{ 'customer.mobileCountryCode': '+91' }, { 'customer.mobileCountryCode': { $in: [null, ''] } }] }
          : { 'customer.mobileCountryCode': mobileCountryCode }),
        status: { $ne: 'refunded' },
      },
    },
    { $project: { createdAt: 1, 'branch.id': 1, 'customer.name': 1 } },
    {
      $group: {
        _id: { $ifNull: ['$branch.id', null] },
        firstSeenAt: { $min: '$createdAt' },
        lastSeenAt: { $max: '$createdAt' },
        latestName: { $last: '$customer.name' },
      },
    },
  ]);

  // All their bills were refunded, so remove the customer.
  if (!rows.length) {
    await this.deleteOne({ _id: key });
    return null;
  }

  const firstSeenAt = new Date(Math.min(...rows.map((r) => r.firstSeenAt.getTime())));
  const lastSeenAt = new Date(Math.max(...rows.map((r) => r.lastSeenAt.getTime())));

  await this.updateOne(
    { _id: key },
    {
      $set: {
        mobile: number,
        mobileCountryCode,
        name: rows[rows.length - 1].latestName || '',
        firstSeenAt,
        lastSeenAt,
        branches: rows.map((row) => ({ branch: row._id, firstSeenAt: row.firstSeenAt })),
      },
    },
    { upsert: true }
  );

  return key;
};

export const Customer = mongoose.model('Customer', customerSchema);
export default Customer;
