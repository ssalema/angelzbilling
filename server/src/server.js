import env from './config/env.js';
import logger from './config/logger.js';
import connectDB, { disconnectDB } from './config/db.js';
import { getRedis, disconnectRedis } from './config/redis.js';
import app from './app.js';

const start = async () => {
  await connectDB();
  // Opens the shared cache / rate-limit connection when REDIS_URL is set, and
  // is a no-op otherwise. Done at boot so a bad URL surfaces in the log now
  // rather than on the first request that needs it.
  getRedis();

  const server = app.listen(env.port, () => {
    console.log(`🚀 Server running on port ${env.port}`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await disconnectDB();
      await disconnectRedis();
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
