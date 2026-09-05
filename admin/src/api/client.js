import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

/**
 * The access token lives in module memory, never in localStorage.
 * An XSS payload can read localStorage; it cannot read a closure variable as
 * easily, and the long-lived refresh token is an httpOnly cookie either way.
 */
let accessToken = null;
let onSessionExpired = null;

export const setAccessToken = (token) => {
  accessToken = token;
};
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

/**
 * Single-flight refresh: if five requests 401 at once we refresh once and
 * replay all five, rather than firing five competing refresh calls (which
 * would invalidate each other because refresh tokens rotate).
 */
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

api.interceptors.response.use(
  (response) => response,
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
  if (error.code === 'ECONNABORTED') {
    return { message: 'The request took too long. Please check your connection and try again.', errors: [], status: 0 };
  }
  if (!error.response) {
    return {
      message: 'Cannot reach the server. Make sure the API is running on port 5000.',
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
