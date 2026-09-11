import cluster from 'node:cluster';

// A one-box message bus, so the in-process caches stay correct across workers.

/** Marks our own IPC traffic, so nothing else on the channel is mistaken for it. */
const ENVELOPE = '__angelz_bust__';

const handlers = new Map();

// Registers what to do when `channel` arrives from another worker.
export const onBroadcast = (channel, handler) => {
  handlers.set(channel, handler);
};

/** Tells the other workers to evict. A no-op in a single process. */
export const broadcast = (channel, payload = null) => {
  if (!cluster.isWorker || typeof process.send !== 'function') return;
  process.send({ [ENVELOPE]: true, channel, payload });
};

const apply = (message) => {
  if (!message || message[ENVELOPE] !== true) return;
  const handler = handlers.get(message.channel);
  if (handler) handler(message.payload);
};

// Listens for relayed evictions.
export const listenForBroadcasts = () => {
  if (!cluster.isWorker) return;
  process.on('message', apply);
};

// Relays one worker's eviction to all the others.
export const relayFromPrimary = (sender, message) => {
  if (!message || message[ENVELOPE] !== true) return;
  for (const worker of Object.values(cluster.workers || {})) {
    if (worker && worker.id !== sender.id && worker.isConnected()) worker.send(message);
  }
};

export default broadcast;
