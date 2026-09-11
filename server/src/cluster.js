// Runs the API across the machine's cores instead of one of them.
import cluster from 'node:cluster';
import os from 'node:os';
import process from 'node:process';

import env from './config/env.js';
import logger from './config/logger.js';
import { relayFromPrimary } from './config/broadcast.js';

const workerCount = env.workers > 0 ? env.workers : os.availableParallelism?.() || os.cpus().length;

// How long a worker has to finish what it is holding before it is killed.
const SHUTDOWN_GRACE_MS = 12_000;

// A crash loop must not be mistaken for resilience.
const MAX_RESTARTS = 10;
const RESTART_WINDOW_MS = 60_000;

const startPrimary = () => {
  logger.info(`[cluster] primary ${process.pid} starting ${workerCount} worker(s)`);

  const restarts = [];
  let shuttingDown = false;

  const fork = () => {
    const worker = cluster.fork();

    // The relay. Every cache eviction on any worker arrives here and goes back out
    // to the others — this is the entire reason the primary exists.
    worker.on('message', (message) => relayFromPrimary(worker, message));

    return worker;
  };

  for (let i = 0; i < workerCount; i += 1) fork();

  cluster.on('exit', (worker, code, signal) => {
    if (shuttingDown) return;

    const now = Date.now();
    // Only failures inside the window count, so a long-lived server that loses one
    // worker a week is never mistaken for a crash loop.
    restarts.push(now);
    while (restarts.length && now - restarts[0] > RESTART_WINDOW_MS) restarts.shift();

    logger.error(
      `[cluster] worker ${worker.process.pid} exited (${signal || `code ${code}`}) — ` +
        `${restarts.length} restart(s) in the last minute`
    );

    if (restarts.length > MAX_RESTARTS) {
      logger.error('[cluster] too many workers are failing to stay up — stopping so the failure is visible');
      process.exit(1);
    }

    fork();
  });

  // Shutdown travels down, not sideways.
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`[cluster] ${signal} received — asking ${Object.keys(cluster.workers || {}).length} worker(s) to stop`);

    for (const worker of Object.values(cluster.workers || {})) worker?.kill('SIGTERM');

    setTimeout(() => {
      for (const worker of Object.values(cluster.workers || {})) worker?.kill('SIGKILL');
      process.exit(0);
    }, SHUTDOWN_GRACE_MS).unref();
  };

  ['SIGINT', 'SIGTERM'].forEach((signal) => process.on(signal, () => shutdown(signal)));
};

if (cluster.isPrimary) {
  startPrimary();
} else {
  // Workers are the ordinary server, unchanged. `server.js` installs the IPC
  // listener itself, so nothing here needs to know about the bus.
  await import('./server.js');
}
