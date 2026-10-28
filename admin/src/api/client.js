import axios from 'axios';
import { clearResourceCache } from './resourceCache.js';
import {
  NETWORK,
  configureNetwork,
  databaseProblem,
  diagnose,
  isConnectionKind,
  isOffline,
  reportConnectionHealthy,
  reportConnectionProblem,
} from './network.js';

// Leave VITE_API_URL unset for same-origin deploys; set it for cross-origin ones.
const trimSlash = (value) => String(value ?? '').trim().replace(/\/+$/, '');

const API_PREFIX = trimSlash(import.meta.env.VITE_API_PREFIX) || '/api/v1';
const BASE_URL = trimSlash(import.meta.env.VITE_API_URL) || API_PREFIX;
configureNetwork({ apiBase: BASE_URL });

// The access token lives in module memory, never in localStorage.
let accessToken = null;
let onSessionExpired = null;
let onSessionRevoked = null;

export const setAccessToken = (token) => {
  accessToken = token;
};

// Read by the socket handshake on every connect attempt.
export const getAccessToken = () => accessToken;
export const setSessionExpiredHandler = (handler) => {
  onSessionExpired = handler;
};

// Called once when the account or its branch is switched off mid-session.
export const setSessionRevokedHandler = (handler) => {
  onSessionRevoked = handler;
};

const REQUEST_TIMEOUT_MS = 30_000;

// All requests waiting on a refresh wait on this one, so it must time out.
const REFRESH_TIMEOUT_MS = 15_000;

// Upload timeout scales with file size so slow mobile links don't time out.
const UPLOAD_FLOOR_BYTES_PER_SEC = 20_000;
const UPLOAD_MIN_TIMEOUT_MS = 60_000;

const uploadTimeoutFor = (form) => {
  let bytes = 0;
  for (const [, value] of form.entries()) if (value instanceof Blob) bytes += value.size;
  return Math.max(UPLOAD_MIN_TIMEOUT_MS, Math.ceil((bytes / UPLOAD_FLOOR_BYTES_PER_SEC) * 1000));
};

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // sends the refresh cookie
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  if (config.data instanceof FormData) {
    // Let the browser set the multipart boundary itself.
    delete config.headers['Content-Type'];
    if (config.timeout === REQUEST_TIMEOUT_MS) config.timeout = uploadTimeoutFor(config.data);
  }
  return config;
});

let refreshPromise = null;
let revoking = false;

const refreshAccessToken = async () => {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true, timeout: REFRESH_TIMEOUT_MS })
      .then((response) => {
        const token = response.data?.data?.accessToken;
        setAccessToken(token);
        return token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

// Used by the socket when the server drops it for an expired token.
export const refreshSession = () => refreshAccessToken();

// Returns true if the response means the session was revoked (SESSION_ENDED).
const endSession = (response) => {
  if (response?.status !== 403 || response.data?.code !== 'SESSION_ENDED') return false;
  // Several requests can fail at once; end the session only once.
  if (revoking) return true;

  revoking = true;
  setAccessToken(null);
  Promise.resolve(onSessionRevoked?.(response.data?.message)).finally(() => {
    revoking = false;
  });
  return true;
};

const MUTATING = new Set(['post', 'put', 'patch', 'delete']);

// No response at all, or a proxy error for a server that is down.
const isUnreachable = (error) =>
  !error.response ? !isTimeout(error) && !isCancel(error) : [502, 503, 504].includes(error.response.status);

const isTimeout = (error) => error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
const isCancel = (error) => error.code === 'ERR_CANCELED' || error.name === 'CanceledError';

const isConnectionFailure = (error) => !error.response || error.response.status >= 500;

// GETs are safe to repeat, so brief outages are retried silently.
const READ_RETRY_DELAYS_MS = [1000, 2500];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

api.interceptors.response.use(
  (response) => {
    reportConnectionHealthy();
    // Any successful write drops every cached read.
    if (MUTATING.has(String(response.config?.method || '').toLowerCase())) clearResourceCache();
    return response;
  },
  async (error) => {
    const { config, response } = error;
    if (response && response.status < 500) reportConnectionHealthy();

    // Never try to refresh the refresh call itself, or the login call.
    const isAuthRoute = config?.url?.includes('/auth/refresh') || config?.url?.includes('/auth/login');

    if (response?.status === 401 && !config?._retried && !isAuthRoute) {
      config._retried = true;
      try {
        const token = await refreshAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          return api(config);
        }
      } catch (refreshError) {
        // A network failure is not a logout; keep the session and retry later.
        if (isConnectionFailure(refreshError)) return rejectWith(refreshError);

        setAccessToken(null);
        if (!endSession(refreshError.response)) onSessionExpired?.();
      }
    }

    const attempt = config?._attempt || 0;
    const isRead = String(config?.method || 'get').toLowerCase() === 'get';
    if (config && isRead && isUnreachable(error) && !isOffline() && attempt < READ_RETRY_DELAYS_MS.length) {
      config._attempt = attempt + 1;
      await wait(READ_RETRY_DELAYS_MS[attempt]);
      // The screen may have moved on while this waited.
      if (!config.signal?.aborted) return api(config);
    }

    if (response?.status === 401 && isAuthRoute && config?.url?.includes('/auth/refresh')) {
      setAccessToken(null);
    }

    // Skip the logout call itself, or ending the session would loop.
    if (!config?.url?.includes('/auth/logout')) endSession(response);

    return rejectWith(error);
  }
);

// Normalises the error and tells the network banner about connection problems.
const rejectWith = async (error) => {
  const normalised = await normaliseError(error);
  if (isConnectionKind(normalised.kind)) reportConnectionProblem(NETWORK[normalised.kind]);
  return Promise.reject(normalised);
};

const connectionError = ({ kind, title, message }) => ({ message, title, kind, errors: [], status: 0, isNetwork: true });

// Every failure reaches the UI in the same shape.
const normaliseError = async (error) => {
  if (isCancel(error)) {
    return { message: 'Request cancelled', errors: [], status: 0, aborted: true };
  }
  if (!error.response) return connectionError(await diagnose({ timedOut: isTimeout(error) }));

  const { status, data } = error.response;
  // A 5xx without our JSON envelope came from a proxy standing in for the
  // server; the probes say whether it is down, slow, or missing its database.
  const fromApi = data && typeof data === 'object' && data.message;
  // Booting: the server said so itself, no probing needed.
  if (data?.code === 'SERVER_STARTING') return { ...connectionError(NETWORK.starting), status };
  if (status >= 500 && (!fromApi || status === 502 || status === 504)) {
    return { ...connectionError(await diagnose({ timedOut: status === 504 })), status };
  }
  // The API's own 500 is often a database it cannot reach; that is worth naming.
  if (status >= 500) {
    const database = await databaseProblem();
    if (database) return { ...connectionError(database), status };
  }

  return {
    message: data?.message || 'Something went wrong. Please try again.',
    errors: data?.errors || [],
    status,
    code: data?.code,
    kind: status >= 500 ? 'server' : undefined,
    isPermission: status === 403,
    isNotFound: status === 404,
  };
};

// Maps server field errors onto react-hook-form fields.
export const applyServerErrors = (error, setError) => {
  if (!error?.errors?.length || !setError) return false;
  error.errors.forEach(({ field, message }) => {
    if (field) setError(field, { type: 'server', message });
  });
  return true;
};

export default api;
