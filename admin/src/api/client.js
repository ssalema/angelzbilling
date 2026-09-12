import axios from 'axios';
import { clearResourceCache } from './resourceCache.js';

// Same-origin deploys leave VITE_API_URL unset and call the relative prefix; cross-origin ones set a full base.
const trimSlash = (value) => String(value ?? '').trim().replace(/\/+$/, '');

const API_PREFIX = trimSlash(import.meta.env.VITE_API_PREFIX) || '/api/v1';
const BASE_URL = trimSlash(import.meta.env.VITE_API_URL) || API_PREFIX;

// The access token lives in module memory, never in localStorage.
let accessToken = null;
let onSessionExpired = null;
let onSessionRevoked = null;

export const setAccessToken = (token) => {
  accessToken = token;
};

/** The live token, read by the socket handshake on every connect attempt. */
export const getAccessToken = () => accessToken;
export const setSessionExpiredHandler = (handler) => {
  onSessionExpired = handler;
};

/**
 * Called once when the server refuses a request because the session itself is
 * finished — the account or its location was switched off mid-session. The
 * realtime nudge normally gets there first; this is the same ending for a tab
 * that has no socket open.
 */
export const setSessionRevokedHandler = (handler) => {
  onSessionRevoked = handler;
};

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // sends the refresh cookie
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  // Let the browser set the multipart boundary itself.
  if (config.data instanceof FormData) delete config.headers['Content-Type'];
  return config;
});

let refreshPromise = null;
// One ending per session: several screens can fail at once on the same cause.
let revoking = false;

const refreshAccessToken = async () => {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
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

/**
 * Mints a fresh access token, sharing the in-flight request with the interceptor
 * above. The socket calls this when the server hangs up on an expired token.
 */
export const refreshSession = () => refreshAccessToken();

/**
 * Ends the session on a response that says the session itself is finished — an
 * account or a location switched off while someone was working. Returns whether
 * this response was one of those, so callers can fall back to their own wording.
 */
const endSession = (response) => {
  if (response?.status !== 403 || response.data?.code !== 'SESSION_ENDED') return false;
  // Several screens can fail at once on the same cause; the session ends once.
  if (revoking) return true;

  revoking = true;
  setAccessToken(null);
  Promise.resolve(onSessionRevoked?.(response.data?.message)).finally(() => {
    revoking = false;
  });
  return true;
};

// Which verbs change something the cached reads describe.
const MUTATING = new Set(['post', 'put', 'patch', 'delete']);

api.interceptors.response.use(
  (response) => {
    // Any successful write drops every cached read.
    if (MUTATING.has(String(response.config?.method || '').toLowerCase())) clearResourceCache();
    return response;
  },
  async (error) => {
    const { config, response } = error;

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
        setAccessToken(null);
        // The refresh was refused because the session is finished, not stale:
        // that reason is the one worth showing on the sign-in page.
        if (!endSession(refreshError.response)) onSessionExpired?.();
      }
    }

    if (response?.status === 401 && isAuthRoute && config?.url?.includes('/auth/refresh')) {
      setAccessToken(null);
    }

    // The session is over rather than this one request being out of bounds. The
    // sign-out call itself is skipped, or ending the session would restart this.
    if (!config?.url?.includes('/auth/logout')) endSession(response);

    return Promise.reject(normaliseError(error));
  }
);

/** Every failure reaches the UI in the same shape, so error states stay simple. */
const normaliseError = (error) => {
  // A request this app cancelled on purpose is not a failure.
  if (error.code === 'ERR_CANCELED' || error.name === 'CanceledError') {
    return { message: 'Request cancelled', errors: [], status: 0, aborted: true };
  }
  if (error.code === 'ECONNABORTED') {
    return { message: 'The request took too long. Please check your connection and try again.', errors: [], status: 0 };
  }
  if (!error.response) {
    return {
      message: `Cannot reach the server. Make sure the API is running and reachable at ${BASE_URL}.`,
      errors: [],
      status: 0,
    };
  }
  const { status, data } = error.response;
  return {
    message: data?.message || 'Something went wrong. Please try again.',
    errors: data?.errors || [],
    status,
    code: data?.code,
    isPermission: status === 403,
    isNotFound: status === 404,
  };
};

/** Maps server field errors onto react-hook-form fields. */
export const applyServerErrors = (error, setError) => {
  if (!error?.errors?.length || !setError) return false;
  error.errors.forEach(({ field, message }) => {
    if (field) setError(field, { type: 'server', message });
  });
  return true;
};

export default api;
