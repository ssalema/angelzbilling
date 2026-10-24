// Runs the API on all CPU cores.
import cluster from 'node:cluster';
import os from 'node:os';
import process from 'node:process';

import env from './config/env.js';
import logger from './config/logger.js';
import { relayFromPrimary } from './config/broadcast.js';

const workerCount = env.workers > 0 ? env.workers : os.availableParallelism?.() || os.cpus().length;

// Time a worker gets to finish requests before being killed.
const SHUTDOWN_GRACE_MS = 12_000;

// Exit instead of restarting forever in a crash loop.
const MAX_RESTARTS = 10;
const RESTART_WINDOW_MS = 60_000;

const startPrimary = () => {
  logger.info(`[cluster] primary ${process.pid} starting ${workerCount} worker(s)`);

  const restarts = [];
  let shuttingDown = false;

  const fork = () => {
    const worker = cluster.fork();

    // Relays cache invalidations and events from one worker to the others.
    worker.on('message', (message) => relayFromPrimary(worker, message));

    return worker;
  };

  for (let i = 0; i < workerCount; i += 1) fork();

  cluster.on('exit', (worker, code, signal) => {
    if (shuttingDown) return;

    const now = Date.now();
    // Only count restarts inside the window.
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
  // Workers run the normal server; it sets up its own IPC listener.
  await import('./server.js');
}
