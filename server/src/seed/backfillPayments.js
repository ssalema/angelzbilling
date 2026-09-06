/**
 * Backfills the payment fields on bills raised before part payments existed.
 *
 *   npm run backfill:payments             — write the changes
 *   npm run backfill:payments -- --dry-run  — print the plan, write nothing
 *
 * Those bills were settled in full at the counter (there was no other way to
 * raise one), so the correct reading of every one of them is: `amountPaid` is
 * the grand total, nothing is due, and the single payment that happened was
 * taken by whoever billed it, when they billed it. That is what this writes.
 *
 * Re-runnable: it only touches documents that are actually missing a field, so
 * a second run reports zero and changes nothing. Bills already carrying a
 * balance — anything raised after this feature shipped — are never rewritten.
 */
import mongoose from 'mongoose';

import logger from '../config/logger.js';
import connectDB, { disconnectDB } from '../config/db.js';
import Bill from '../models/Bill.js';

const dryRun = process.argv.includes('--dry-run');

/**
 * The slip prints the money taken at the counter as "During Billing" and stamps
 * every later collection with its own date, and it reads that from the payment's
 * `atBilling` flag rather than guessing from position.
 *
 * Bills saved in the short window between part payments shipping and that flag
 * being added carry payments without it, so their first line prints a date where
 * it should say "During Billing". This finds them and marks it.
 *
 * The initial payment is written in the same breath as the bill itself, so it is
 * the one whose timestamp sits on `createdAt`. A few seconds of slack covers the
 * gap between mongoose stamping the document and the payment's own `at`, and is
 * far tighter than any real return visit.
 */
const BILLING_WINDOW_MS = 5000;

const markBillingPayments = async () => {
  const candidates = await Bill.find({
    'payments.0': { $exists: true },
    payments: { $not: { $elemMatch: { atBilling: true } } },
  })
    .select('billNumber createdAt payments')
    .lean();

  const writes = [];

  candidates.forEach((bill) => {
    const first = [...bill.payments].sort((a, b) => new Date(a.at) - new Date(b.at))[0];
    if (!first) return;
    // A bill raised with nothing paid has no billing-time payment at all — its
    // first entry is a genuine later collection and must keep its date.
    if (Math.abs(new Date(first.at) - new Date(bill.createdAt)) > BILLING_WINDOW_MS) return;

    writes.push({
      updateOne: {
        filter: { _id: bill._id, 'payments._id': first._id },
        update: { $set: { 'payments.$.atBilling': true } },
      },
    });
  });

  if (!writes.length) {
    logger.info('No payments needed the "During Billing" marker.');
    return;
  }

  logger.info(`${writes.length} bill(s) need their first payment marked as taken during billing${dryRun ? ' (dry run)' : ''}.`);
  if (dryRun) return;

  const result = await Bill.bulkWrite(writes);
  logger.info(`Marked ${result.modifiedCount} billing-time payment(s).`);
};

const run = async () => {
  await connectDB();

  await markBillingPayments();

  // A legacy bill is one with no balance recorded at all. `amountDue` is the
  // marker rather than `payments`, because a genuinely unpaid new bill has an
  // empty payments array too — it just also has a due amount.
  const legacy = await Bill.find({ amountDue: { $exists: false } })
    .select('billNumber grandTotal amountPaid paymentMethod status billedBy createdAt refundedAt refundReason')
    .lean();

  if (!legacy.length) {
    logger.info('Nothing to backfill — every bill already carries its payment fields.');
    return;
  }

  logger.info(`${legacy.length} bill(s) to backfill${dryRun ? ' (dry run)' : ''}.`);

  const writes = legacy.map((bill) => {
    // These bills were paid in full; `amountPaid` was already written that way
    // at creation, so fall back to the total only if it somehow is not.
    const paid = Number(bill.amountPaid) || Number(bill.grandTotal) || 0;
    const by = bill.billedBy || { id: bill.billedBy?.id, name: 'System', email: '' };

    const statusHistory = [
      { from: '', to: bill.status === 'refunded' ? 'paid' : bill.status, at: bill.createdAt, by, note: 'Bill created' },
    ];
    // A refunded legacy bill has a second transition, and the refund stamp on
    // the document says exactly when it happened.
    if (bill.status === 'refunded') {
      statusHistory.push({
        from: 'paid',
        to: 'refunded',
        at: bill.refundedAt || bill.createdAt,
        by,
        note: bill.refundReason || '',
      });
    }

    return {
      updateOne: {
        filter: { _id: bill._id },
        update: {
          $set: {
            amountPaid: paid,
            // Refunded or not, a bill that was settled in full owes nothing.
            amountDue: 0,
            payments: paid
              ? [
                  {
                    amount: paid,
                    method: bill.paymentMethod,
                    at: bill.createdAt,
                    by,
                    // These bills were settled as they were raised.
                    atBilling: true,
                    note: 'Payment at billing',
                  },
                ]
              : [],
            statusHistory,
          },
        },
      },
    };
  });

  if (dryRun) {
    legacy.slice(0, 10).forEach((bill) =>
      logger.info(`  ${bill.billNumber} · ${bill.status} · paid ${bill.amountPaid ?? bill.grandTotal}, due 0`)
    );
    if (legacy.length > 10) logger.info(`  …and ${legacy.length - 10} more`);
    return;
  }

  const result = await Bill.bulkWrite(writes);
  logger.info(`Backfilled ${result.modifiedCount} bill(s).`);
};

run()
  .catch((error) => {
    logger.error(`Backfill failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDB();
    await mongoose.connection.close().catch(() => {});
  });
