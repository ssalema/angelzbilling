import cluster from 'node:cluster';
import http from 'node:http';

import env, { configWarnings } from './config/env.js';
import logger from './config/logger.js';
import connectDB, { disconnectDB } from './config/db.js';
import { listenForBroadcasts } from './config/broadcast.js';
import { initSocket, closeSocket } from './config/socket.js';
import { runBackfill } from './seed/backfill.js';
import app from './app.js';

// Logs a warning at boot for any security control that is switched off.
const announceConfig = () => {
  const warnings = configWarnings();
  if (!warnings.length) return;

  logger.warn('─── Configuration warnings ───');
  warnings.forEach((warning) => logger.warn(`  • ${warning}`));
  logger.warn('──────────────────────────────');
};

const start = async () => {
  announceConfig();

  listenForBroadcasts();

  await connectDB();

  // Fill in derived fields for old data. Only one worker runs it to avoid races.
  if (!cluster.isWorker || cluster.worker.id === 1) await runBackfill();

  // Socket.IO shares the HTTP server: one port, one origin, one set of CORS rules.
  const server = http.createServer(app);
  initSocket(server);

  server.listen(env.port, () => {
    console.log(`🚀 Server running on port ${env.port}`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    // Close sockets first, or open connections keep the HTTP server alive.
    closeSocket().catch(() => {});
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    // Do not hang forever if a connection refuses to drain.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  ['SIGINT', 'SIGTERM'].forEach((signal) => process.on(signal, () => shutdown(signal)));

  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${reason instanceof Error ? reason.stack : reason}`);
  });

  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught exception: ${error.stack}`);
    process.exit(1);
  });
};

start();
