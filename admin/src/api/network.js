// Works out why a request got no response (offline, slow link, or server down)
// and keeps one shared message for each case.

export const NETWORK = {
  offline: {
    kind: 'offline',
    title: "You're offline",
    message: "You're offline. Check your internet connection — the panel picks up again once you're back online.",
  },
  slow: {
    kind: 'slow',
    title: 'Connection too slow',
    message:
      "Your internet connection is too slow right now, so the server's reply didn't arrive in time. Try again once the signal improves.",
  },
  interrupted: {
    kind: 'interrupted',
    title: 'Connection interrupted',
    message: 'The connection dropped before the server could reply. Your internet and the server are both working — please try again.',
  },
  serverSlow: {
    kind: 'serverSlow',
    title: 'Server is slow to respond',
    message:
      'Your internet is working and the server is up, but it took too long to answer this request. Please try again in a moment.',
  },
  serverDown: {
    kind: 'serverDown',
    title: 'Server not responding',
    message:
      "Your internet is working, but the server isn't answering. If it has been idle it may be waking up, which can take up to a minute; otherwise it may be down.",
  },
  starting: {
    kind: 'starting',
    title: 'Server is starting up',
    message: 'The server is restarting and will be ready in a few seconds.',
  },
  database: {
    kind: 'database',
    title: 'Database unavailable',
    message:
      "The server is running but can't reach its database right now, so nothing can be loaded or saved. Please try again in a few minutes.",
  },
};

/** The kinds where the fault is on the server's side, not this device's. */
export const SERVER_KINDS = ['serverSlow', 'serverDown', 'database', 'starting'];

export const isConnectionKind = (kind) => Boolean(kind && NETWORK[kind]);

// Uses the browser's Network Information API where available.
const linkLooksSlow = () => {
  const link = typeof navigator !== 'undefined' ? navigator.connection : null;
  if (!link) return false;
  return ['slow-2g', '2g'].includes(link.effectiveType) || link.rtt >= 1500 || (link.downlink > 0 && link.downlink < 0.3);
};

export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

// A probe slower than this means the link is too slow (healthy links take well under 1s).
const SLOW_PROBE_MS = 1500;
const PROBE_TIMEOUT_MS = 6000;

// The API base, set by api/client.js so the health check hits the same server.
let apiBase = '/api/v1';
export const configureNetwork = ({ apiBase: base }) => {
  if (base) apiBase = base;
};

const timedFetch = async (url, options) => {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: 'no-store', ...options, signal: controller.signal });
    return { response, ms: Date.now() - started };
  } catch {
    return { response: null, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
};

// Pings a tiny file on our own origin (not the API) to test the internet link.
const probeLink = async () => {
  const { response, ms } = await timedFetch(`${window.location.origin}/favicon.png?probe=${Date.now()}`, {
    method: 'HEAD',
  });
  return { reachable: Boolean(response), ms };
};

// Asks the API itself whether it is up and whether its database answers. A 503
// in the API's own envelope means the server is up but the database is not; a
// 502/504 or a non-JSON page came from a proxy standing in for a server that is down.
const probeServer = async () => {
  const { response } = await timedFetch(`${apiBase}/health`, { credentials: 'omit' });
  if (!response) return { up: false };
  if (response.ok) return { up: true, database: 'ok' };
  const body = await response.json().catch(() => null);
  if (response.status === 503 && body?.data?.database) return { up: true, database: body.data.database };
  return { up: false };
};

// `timedOut`: true if the request hit its timeout, false if it failed outright.
// Every message is backed by what the two probes actually saw.
export const diagnose = async ({ timedOut }) => {
  if (isOffline()) return NETWORK.offline;

  const [link, server] = await Promise.all([probeLink(), probeServer()]);
  if (!link.reachable && !server.up) return timedOut ? NETWORK.slow : NETWORK.offline;

  const linkSlow = (link.reachable && link.ms > SLOW_PROBE_MS) || linkLooksSlow();
  if (server.up) {
    if (server.database === 'starting') return NETWORK.starting;
    if (server.database !== 'ok') return NETWORK.database;
    if (linkSlow) return NETWORK.slow;
    return timedOut ? NETWORK.serverSlow : NETWORK.interrupted;
  }
  return linkSlow ? NETWORK.slow : NETWORK.serverDown;
};

/** For an API 500: whether the database is the reason, or null when it is not. */
export const databaseProblem = async () => {
  const server = await probeServer();
  if (!server.up || server.database === 'ok') return null;
  return server.database === 'starting' ? NETWORK.starting : NETWORK.database;
};

/**
 * What the server is doing right now, for a screen that is still waiting on a
 * request: 'ready', 'starting', 'database', or 'silent' when nothing answered.
 */
export const checkServer = async () => {
  const server = await probeServer();
  if (!server.up) return 'silent';
  if (server.database === 'ok') return 'ready';
  return server.database === 'starting' ? 'starting' : 'database';
};

// Current network condition, shown by the banner.
let condition = isOffline() ? NETWORK.offline : null;
const listeners = new Set();

const publish = (next) => {
  if (next?.kind === condition?.kind) return;
  condition = next;
  listeners.forEach((listener) => listener(condition));
};

export const getNetworkCondition = () => condition;

export const subscribeNetwork = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const reportConnectionProblem = (info) => publish(info);

export const reportConnectionHealthy = () => {
  if (!isOffline()) publish(null);
};

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => publish(NETWORK.offline));
  window.addEventListener('online', () => publish(null));
}

// Key for the Idempotency-Key header. `randomUUID` needs a secure origin
// (not available over a LAN IP), so fall back to `getRandomValues`.
export const newRequestKey = () => {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};
