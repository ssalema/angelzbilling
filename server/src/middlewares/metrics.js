import mongoose from 'mongoose';
import logger from '../config/logger.js';

// What the server is actually doing, as opposed to what it was designed to do.

// Latency per route, held as a histogram rather than a mean.
const BUCKET_EDGES_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

/** Keyed by method plus route PATTERN, never the URL — ids would unbound this. */
const routes = new Map();

/** A hard ceiling, so an unmatched path cannot grow the map without limit. */
const MAX_ROUTES = 300;

const emptyRoute = () => ({
  count: 0,
  errors: 0,
  totalMs: 0,
  maxMs: 0,
  buckets: new Array(BUCKET_EDGES_MS.length + 1).fill(0),
});

const bucketFor = (ms) => {
  for (let i = 0; i < BUCKET_EDGES_MS.length; i += 1) if (ms <= BUCKET_EDGES_MS[i]) return i;
  return BUCKET_EDGES_MS.length;
};

// The route's PATTERN, not the URL that matched it.
const routeKey = (req) => {
  const pattern = req.route?.path;
  const base = req.baseUrl || '';
  if (!pattern) return `${req.method} (unmatched)`;
  return `${req.method} ${base}${pattern === '/' ? '' : pattern}`;
};

// How long a request may take before it is worth a log line of its own.
const SLOW_REQUEST_MS = 500;

export const collectMetrics = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const key = routeKey(req);

    let row = routes.get(key);
    if (!row) {
      if (routes.size >= MAX_ROUTES) return;
      row = emptyRoute();
      routes.set(key, row);
    }

    row.count += 1;
    row.totalMs += ms;
    if (ms > row.maxMs) row.maxMs = ms;
    if (res.statusCode >= 500) row.errors += 1;
    row.buckets[bucketFor(ms)] += 1;

    if (ms >= SLOW_REQUEST_MS) {
      logger.warn(`[slow] ${key} ${res.statusCode} ${Math.round(ms)}ms`);
    }
  });

  return next();
};

// An approximate percentile off the buckets.
const percentile = (row, fraction) => {
  const target = row.count * fraction;
  let seen = 0;
  for (let i = 0; i < row.buckets.length; i += 1) {
    seen += row.buckets[i];
    if (seen >= target) return BUCKET_EDGES_MS[i] ?? `>${BUCKET_EDGES_MS[BUCKET_EDGES_MS.length - 1]}`;
  }
  return 0;
};

// Event loop lag, sampled rather than measured per request.
const LAG_SAMPLE_MS = 500;
let lagMs = 0;
let lagMaxMs = 0;

let lagTimer = null;

export const startLagSampler = () => {
  if (lagTimer) return lagTimer;
  let last = process.hrtime.bigint();

  lagTimer = setInterval(() => {
    const now = process.hrtime.bigint();
    const elapsed = Number(now - last) / 1e6;
    last = now;
    lagMs = Math.max(0, elapsed - LAG_SAMPLE_MS);
    if (lagMs > lagMaxMs) lagMaxMs = lagMs;
  }, LAG_SAMPLE_MS);

  // Must not be the reason the process refuses to exit.
  lagTimer.unref();
  return lagTimer;
};

/** Everything collected, in the shape the metrics endpoint serves. */
export const snapshot = ({ caches = {} } = {}) => {
  const byRoute = [...routes.entries()]
    .map(([route, row]) => ({
      route,
      count: row.count,
      errors: row.errors,
      averageMs: Math.round((row.totalMs / row.count) * 10) / 10,
      p50Ms: percentile(row, 0.5),
      p95Ms: percentile(row, 0.95),
      p99Ms: percentile(row, 0.99),
      maxMs: Math.round(row.maxMs),
    }))
    // Slowest first on p95, because that is the list anyone opening this wants.
    .sort((a, b) => b.count * b.averageMs - a.count * a.averageMs);

  const memory = process.memoryUsage();

  return {
    uptimeSeconds: Math.round(process.uptime()),
    pid: process.pid,
    eventLoop: { lagMs: Math.round(lagMs * 10) / 10, maxLagMs: Math.round(lagMaxMs * 10) / 10 },
    memory: {
      heapUsedMb: Math.round(memory.heapUsed / 1048576),
      heapTotalMb: Math.round(memory.heapTotal / 1048576),
      rssMb: Math.round(memory.rss / 1048576),
    },
    database: {
      state: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
      name: mongoose.connection.name || null,
      // How much of the connection pool is in use.
      poolSize: mongoose.connection.getClient?.()?.topology?.s?.servers?.size ?? null,
    },
    caches,
    routes: byRoute,
  };
};

export default collectMetrics;
