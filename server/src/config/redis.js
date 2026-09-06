/**
 * Optional Redis connection, shared by the analytics cache and the rate limiters.
 *
 * Both of those are per-process by default, which is correct for exactly one
 * API instance and quietly wrong for two. The rate limiter is the dangerous
 * half: with the counter held in each process's memory, running two instances
 * behind a load balancer means a caller gets the configured limit *per
 * instance*, so "20 sign-in attempts per 15 minutes" silently becomes 40. The
 * cache is the merely wasteful half — each instance keeps its own copy, so the
 * hit rate falls by roughly the instance count.
 *
 * Set REDIS_URL and both problems go away. Leave it unset and everything stays
 * exactly as it was — in-process, no new failure mode, no infrastructure to
 * run. That is the right default for a single-instance deployment, which is
 * what this app is today.
 *
 * The connection is deliberately lazy and failure-tolerant: Redis going away
 * must degrade the app to "uncached and locally rate limited", never take it
 * down. Analytics figures and request counters are not worth a 500.
 */
import Redis from 'ioredis';
import env from './env.js';
import logger from './logger.js';

let client = null;
let unavailableSince = null;

/**
 * The shared client, or null when Redis is not configured.
 *
 * Callers must handle null — that is the single-instance path, not an error.
 */
export const getRedis = () => {
  if (!env.redisUrl) return null;
  if (client) return client;

  client = new Redis(env.redisUrl, {
    // A request must never sit waiting on a cache. If Redis is slow or down,
    // fail the command quickly and let the caller fall through to the database.
    connectTimeout: 3000,
    commandTimeout: 1000,
    maxRetriesPerRequest: 1,
    // The offline queue must stay ON. RedisStore issues SCRIPT LOAD from its
    // constructor, which runs while this socket is still connecting — with the
    // queue off, ioredis rejects that command outright ("Stream isn't
    // writeable") and the unawaited rejection kills the process at boot.
    // Queueing does not reintroduce the hang it was turned off to prevent:
    // `commandTimeout` is armed before a command reaches the queue, so a
    // command waiting on a dead connection still fails after 1s.
    enableOfflineQueue: true,
    // Back off rather than hammering a Redis that is restarting.
    retryStrategy: (attempt) => Math.min(attempt * 500, 10_000),
  });

  client.on('error', (error) => {
    // Log the first failure and then stay quiet: a down Redis emits this
    // continuously and would otherwise drown the log.
    if (!unavailableSince) {
      unavailableSince = Date.now();
      logger.warn(`Redis unavailable, falling back to in-process cache: ${error.message}`);
    }
  });

  client.on('ready', () => {
    if (unavailableSince) {
      logger.info(`Redis recovered after ${Math.round((Date.now() - unavailableSince) / 1000)}s`);
      unavailableSince = null;
    } else {
      logger.info('Redis connected — cache and rate limits are shared across instances');
    }
  });

  return client;
};

export const isRedisEnabled = () => Boolean(env.redisUrl);

/** True while the client exists and is actually usable for a command right now. */
export const isRedisReady = () => Boolean(client && client.status === 'ready');

export const disconnectRedis = async () => {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
  client = null;
};

export default getRedis;
