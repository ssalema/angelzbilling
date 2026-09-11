import axios from 'axios';
import { clearResourceCache } from './resourceCache.js';

// Same-origin deploys leave VITE_API_URL unset and call the relative prefix; cross-origin ones set a full base.
const trimSlash = (value) => String(value ?? '').trim().replace(/\/+$/, '');

const API_PREFIX = trimSlash(import.meta.env.VITE_API_PREFIX) || '/api/v1';
const BASE_URL = trimSlash(import.meta.env.VITE_API_URL) || API_PREFIX;

// The access token lives in module memory, never in localStorage.
let accessToken = null;
let onSessionExpired = null;

export const setAccessToken = (token) => {
  accessToken = token;
};

/** The live token, read by the socket handshake on every connect attempt. */
export const getAccessToken = () => accessToken;
export const setSessionExpiredHandler = (handler) => {
  onSessionExpired = handler;
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
      } catch {
        setAccessToken(null);
        onSessionExpired?.();
      }
    }

    if (response?.status === 401 && isAuthRoute && config?.url?.includes('/auth/refresh')) {
      setAccessToken(null);
    }

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
