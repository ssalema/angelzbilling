import mongoose from 'mongoose';

/**
 * Atomic sequence generator. `findOneAndUpdate` with `$inc` + `upsert` is a
 * single-document atomic operation, so two cashiers saving at the exact same
 * millisecond can never receive the same bill number.
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

counterSchema.statics.next = async function next(key) {
  const doc = await this.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc.seq;
};

export const Counter = mongoose.model('Counter', counterSchema);
export default Counter;
