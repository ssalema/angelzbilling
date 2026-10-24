import IdempotencyKey from '../models/IdempotencyKey.js';
import ApiError from '../utils/ApiError.js';

// Makes a write safe to send twice. On a slow link the server can commit a bill
// and the answer still never reach the counter; the cashier then presses save
// again. The panel sends the same `Idempotency-Key` for both attempts, and the
// second one is answered with the first one's result instead of being run.

const HEADER = 'idempotency-key';
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

// A first attempt still marked pending after this long died with its process.
const STALE_PENDING_MS = 2 * 60_000;

const isDuplicate = (error) => error?.code === 11000;

export const idempotent = async (req, res, next) => {
  const key = req.get(HEADER);
  // Opt-in: a caller that sends no key gets the plain behaviour.
  if (!key) return next();
  if (!KEY_PATTERN.test(key)) return next(ApiError.badRequest('The Idempotency-Key header is not valid.'));

  const id = `${req.user?._id || 'anonymous'}:${key}`;
  const path = req.originalUrl.split('?')[0];

  try {
    await IdempotencyKey.create({ _id: id, method: req.method, path });
  } catch (error) {
    if (!isDuplicate(error)) return next(error);

    const record = await IdempotencyKey.findById(id).lean();
    if (!record) return idempotent(req, res, next); // expired between the two reads

    if (record.method !== req.method || record.path !== path) {
      return next(ApiError.unprocessable('This Idempotency-Key was already used for a different request.'));
    }

    if (record.state === 'done') {
      // Replayed, not re-run: the realtime layer must not announce it again.
      res.locals.idempotentReplay = true;
      res.set('Idempotent-Replayed', 'true');
      return res.status(record.status).json(record.body);
    }

    if (Date.now() - new Date(record.createdAt).getTime() > STALE_PENDING_MS) {
      await IdempotencyKey.deleteOne({ _id: id, state: 'pending' });
      return idempotent(req, res, next);
    }

    return next(
      new ApiError(
        409,
        'Your previous attempt is still being saved. Wait a moment, then try again.',
        [],
        true,
        'REQUEST_IN_PROGRESS'
      )
    );
  }

  // Stored from res.json rather than on 'finish': when the client has already
  // given up, the socket is gone and 'finish' never fires, but the write still
  // happened and the retry still needs its answer.
  const json = res.json.bind(res);
  res.json = (body) => {
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    // A refused write changed nothing, so the key is released for the corrected retry.
    const settle = ok
      ? IdempotencyKey.updateOne({ _id: id }, { state: 'done', status: res.statusCode, body })
      : IdempotencyKey.deleteOne({ _id: id });
    settle.catch(() => {}).finally(() => json(body));
    return res;
  };

  return next();
};

export default idempotent;
