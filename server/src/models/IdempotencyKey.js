import mongoose from 'mongoose';

// One row per write the client wants run at most once. `_id` is account + key,
// so uniqueness holds even if secondary indexes were never built.
const idempotencyKeySchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    method: { type: String, required: true },
    path: { type: String, required: true },
    // 'pending' while the first attempt runs, 'done' once its answer is stored.
    state: { type: String, enum: ['pending', 'done'], default: 'pending' },
    status: { type: Number, default: null },
    body: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// Retries come within minutes; expire after a day to keep the collection small.
idempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export const IdempotencyKey = mongoose.model('IdempotencyKey', idempotencyKeySchema);
export default IdempotencyKey;
