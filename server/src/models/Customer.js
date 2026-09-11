import mongoose from 'mongoose';

// One row per person ever billed, maintained on write instead of derived on read.

// Where this customer has been billed, and when they first were at each place.
const seenAtSchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    firstSeenAt: { type: Date, required: true },
  },
  { _id: false }
);

const customerSchema = new mongoose.Schema(
  {
    /** `${mobileCountryCode}${mobile}` — see IDENTITY above. */
    _id: { type: String, required: true },

    mobile: { type: String, required: true },
    mobileCountryCode: { type: String, default: '+91' },
    /** The name on their most recent bill. People correct their own spelling. */
    name: { type: String, default: '' },

    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },

    branches: { type: [seenAtSchema], default: [] },
  },
  { versionKey: false, timestamps: true }
);

/** "New customers in this window", store-wide. */
customerSchema.index({ firstSeenAt: 1 });
/** The same question narrowed to one location — multikey, so it serves both. */
customerSchema.index({ 'branches.branch': 1, 'branches.firstSeenAt': 1 });

// Records a bill against its customer.
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

  // The location entry, added only if this person has not been seen here before.
  await this.updateOne(
    { _id: key, branches: { $not: { $elemMatch: { branch } } } },
    { $push: { branches: { branch, firstSeenAt: at } } },
    options
  );

  return key;
};

// Rebuilds one customer's row from the bills that still count.
customerSchema.statics.reconcile = async function reconcile({ mobile, mobileCountryCode = '+91' }) {
  const number = String(mobile || '').trim();
  if (!number) return null;

  const key = `${mobileCountryCode}${number}`;
  const Bill = mongoose.model('Bill');

  const rows = await Bill.aggregate([
    {
      $match: {
        'customer.mobile': number,
        // Written before country codes existed means +91, matching CUSTOMER_KEY
        // in the dashboard and `recordBill` above.
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

  // Every bill of theirs was handed back, so they were never a customer.
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
