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
  // The message names the exact mistake; see setupProblem below.
  misconfigured: {
    kind: 'misconfigured',
    title: 'Panel is pointing at the wrong server',
    message: 'This copy of the panel cannot reach its server because of how it was built.',
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
  } catch (error) {
    return { response: null, ms: Date.now() - started, timedOut: controller.signal.aborted, error };
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
  const { response, ms, timedOut } = await timedFetch(`${apiBase}/health`, { credentials: 'omit' });
  if (!response) return { up: false, ms, timedOut };
  if (response.ok) return { up: true, database: 'ok', ms, status: response.status };
  const body = await response.json().catch(() => null);
  if (response.status === 503 && body?.data?.database) {
    return { up: true, database: body.data.database, ms, status: response.status };
  }
  return { up: false, ms, status: response.status };
};

/* ───────────── Setup mistakes, which no amount of waiting fixes ───────────── */

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0'];
const isLocalHost = (host) => LOCAL_HOSTS.includes(host) || host.endsWith('.localhost');

const apiUrl = () => {
  try {
    return new URL(apiBase, window.location.origin);
  } catch {
    return null;
  }
};

// The browser reports a request its CSP refused here, and nowhere the page can
// otherwise see — to the request itself it looks like any failed connection.
let cspBlockedUrl = null;
if (typeof document !== 'undefined') {
  document.addEventListener('securitypolicyviolation', (event) => {
    if (String(event.violatedDirective).startsWith('connect-src')) cspBlockedUrl = event.blockedURI;
  });
}

/**
 * A failure that comes from how the panel was built or hosted, decided from the
 * addresses alone. Each one fails every time, fast or slow internet alike.
 */
const setupProblem = () => {
  const api = apiUrl();
  if (!api) return null;
  const page = window.location;

  // VITE_API_URL is baked in at build time. Built as localhost, it points every
  // other device at itself.
  if (isLocalHost(api.hostname) && !isLocalHost(page.hostname)) {
    return {
      ...NETWORK.misconfigured,
      message:
        `This copy of the panel was built to reach the server at ${api.origin}. On this device "${api.hostname}" ` +
        'means the device itself, so the server can never be reached from here. Rebuild the panel with ' +
        "VITE_API_URL set to the server's public address.",
    };
  }

  if (page.protocol === 'https:' && api.protocol === 'http:' && !isLocalHost(api.hostname)) {
    return {
      ...NETWORK.misconfigured,
      message:
        `This page is secure (https) but the server address ${api.origin} is not (http), so the browser blocks ` +
        'every request to it. Serve the API over https and rebuild the panel with that address.',
    };
  }

  if (cspBlockedUrl && cspBlockedUrl.startsWith(api.origin)) {
    return {
      ...NETWORK.misconfigured,
      message:
        `The page's security policy does not allow connecting to ${api.origin}, so the browser blocks every ` +
        'request to it. Rebuild the panel with VITE_API_URL set to this exact address.',
    };
  }

  return null;
};

/** What each check saw, for the "Show details" section of an error. */
const describe = ({ timedOut, code, link, server }) => {
  const api = apiUrl();
  const lines = [
    `Server address: ${api ? `${api.origin}${api.pathname}` : apiBase}`,
    `Panel address: ${window.location.origin}`,
    `Request: ${timedOut ? 'no reply before the time limit' : `could not connect${code ? ` (${code})` : ''}`}`,
  ];
  if (link) lines.push(`Internet check: ${link.reachable ? `ok in ${link.ms} ms` : `failed after ${link.ms} ms`}`);
  if (server) {
    lines.push(
      `Server check: ${
        server.status
          ? `answered ${server.status}${server.database ? ` (database: ${server.database})` : ''} in ${server.ms} ms`
          : server.timedOut
            ? `no answer within ${PROBE_TIMEOUT_MS / 1000} s`
            : `could not connect (${server.ms} ms)`
      }`
    );
  }
  if (typeof navigator !== 'undefined' && navigator.connection?.effectiveType) {
    lines.push(`Network type: ${navigator.connection.effectiveType}`);
  }
  return lines;
};

// `timedOut`: true if the request hit its timeout, false if it failed outright.
// Every message is backed by what the checks actually saw, and carries them.
export const diagnose = async ({ timedOut, code } = {}) => {
  const setup = setupProblem();
  if (setup) return { ...setup, details: describe({ timedOut, code }) };
  if (isOffline()) return { ...NETWORK.offline, details: describe({ timedOut, code }) };

  const [link, server] = await Promise.all([probeLink(), probeServer()]);
  const found = (info) => ({ ...info, details: describe({ timedOut, code, link, server }) });

  // The check itself may have tripped the security policy.
  const late = setupProblem();
  if (late) return found(late);

  if (!link.reachable && !server.up) return found(timedOut ? NETWORK.slow : NETWORK.offline);

  const linkSlow = (link.reachable && link.ms > SLOW_PROBE_MS) || linkLooksSlow();
  if (server.up) {
    if (server.database === 'starting') return found(NETWORK.starting);
    if (server.database !== 'ok') return found(NETWORK.database);
    if (linkSlow) return found(NETWORK.slow);
    return found(timedOut ? NETWORK.serverSlow : NETWORK.interrupted);
  }
  return found(linkSlow ? NETWORK.slow : NETWORK.serverDown);
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
  if (setupProblem()) return 'misconfigured';
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
