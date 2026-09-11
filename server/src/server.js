import cluster from 'node:cluster';
import http from 'node:http';

import env, { configWarnings } from './config/env.js';
import logger from './config/logger.js';
import connectDB, { disconnectDB } from './config/db.js';
import { listenForBroadcasts } from './config/broadcast.js';
import { initSocket, closeSocket } from './config/socket.js';
import { runBackfill } from './seed/backfill.js';
import app from './app.js';

// Every security control that can be switched off now says so at boot.
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

  // Rows written before the derived stores existed carry none of them, which is
  // a wrong figure on a dashboard card rather than an error anyone would see.
  // The pass is idempotent and only touches what is missing, so it costs nothing
  // on a database that is already current. One worker does it for the cluster —
  // the rest would only race each other over the same upserts.
  if (!cluster.isWorker || cluster.worker.id === 1) await runBackfill();

  // The websocket layer shares the HTTP server the API listens on, so there is
  // one port, one origin and one set of CORS rules. See config/socket.js.
  const server = http.createServer(app);
  initSocket(server);

  server.listen(env.port, () => {
    console.log(`🚀 Server running on port ${env.port}`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    // Close the sockets first: an open connection would hold the HTTP server
    // up past the grace period, and every client reconnects on its own anyway.
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
