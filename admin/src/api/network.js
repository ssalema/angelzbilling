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
  serverSlow: {
    kind: 'serverSlow',
    title: 'Server is slow to respond',
    message: 'The server is taking too long to respond. Your internet is working — please try again in a moment.',
  },
  serverDown: {
    kind: 'serverDown',
    title: 'Server unavailable',
    message:
      "The server can't be reached right now. Your internet is working, so the problem is on our side — please try again in a few minutes.",
  },
};

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

// Pings a tiny file on our own origin (not the API) to test the internet link.
const probe = async () => {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(`${window.location.origin}/favicon.png?probe=${started}`, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    return { reachable: true, ms: Date.now() - started };
  } catch {
    return { reachable: false, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
};

// `timedOut`: true if the request hit its timeout, false if it failed outright.
export const diagnose = async ({ timedOut }) => {
  if (isOffline()) return NETWORK.offline;

  const { reachable, ms } = await probe();
  if (!reachable) return timedOut ? NETWORK.slow : NETWORK.offline;
  if (ms > SLOW_PROBE_MS || linkLooksSlow()) return NETWORK.slow;
  return timedOut ? NETWORK.serverSlow : NETWORK.serverDown;
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
