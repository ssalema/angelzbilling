import api from './client.js';

/** One thin module per resource. Every call returns the unwrapped payload. */

// Turns an optional AbortSignal into axios config.
const req = (signal, config = {}) => (signal ? { ...config, signal } : config);

const unwrap = (response) => response.data?.data;
const unwrapFull = (response) => ({ items: response.data?.data ?? [], meta: response.data?.meta ?? {} });
const message = (response) => response.data?.message;

// Axios config that reports upload percentage.
const withProgress = (onProgress) =>
  onProgress
    ? {
        onUploadProgress: (event) => {
          if (event.total) onProgress(Math.round((event.loaded * 100) / event.total));
        },
      }
    : undefined;

/* ─────────────────────────────── Auth ─────────────────────────────── */
export const authApi = {
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data.data),
  logout: () => api.post('/auth/logout').then(message),
  me: () => api.get('/auth/me').then((r) => r.data.data.user),
  updateProfile: (payload) => api.patch('/auth/me', payload).then((r) => r.data.data.user),
  uploadAvatar: (file, onProgress) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/auth/me/avatar', form, withProgress(onProgress)).then((r) => r.data);
  },
  removeAvatar: () => api.delete('/auth/me/avatar').then((r) => r.data),
  changePassword: (payload) => api.post('/auth/change-password', payload).then(message),
};

/* ─────────────────────────────── Dashboard ─────────────────────────────── */
export const dashboardApi = {
  // Every widget for one range in a single request — what the page uses on load.
  // The per-widget calls below are for when a card's own range diverges.
  overview: (params, signal) => api.get('/dashboard/overview', req(signal, { params })).then(unwrap),
  summary: (params, signal) => api.get('/dashboard/summary', req(signal, { params })).then(unwrap),
  series: (params, signal) => api.get('/dashboard/revenue-series', req(signal, { params })).then(unwrap),
  paymentMethods: (params, signal) =>
    api.get('/dashboard/payment-methods', req(signal, { params })).then(unwrap),
  billStatus: (params, signal) => api.get('/dashboard/bill-status', req(signal, { params })).then(unwrap),
  topPerfumes: (params, signal) => api.get('/dashboard/top-perfumes', req(signal, { params })).then(unwrap),
  recentBills: (params, signal) => api.get('/dashboard/recent-bills', req(signal, { params })).then(unwrap),
  lowStock: (params, signal) => api.get('/dashboard/low-stock', req(signal, { params })).then(unwrap),
};

/* ─────────────────────────────── Perfumes ─────────────────────────────── */
export const perfumeApi = {
  list: (params, signal) => api.get('/perfumes', req(signal, { params })).then(unwrapFull),
  facets: (signal) => api.get('/perfumes/facets', req(signal)).then(unwrap),
  // Fires on every keystroke in the billing screen — the call cancellation matters
  // most here, since an abandoned query is work nobody will ever read.
  lookup: (params, signal) => api.get('/perfumes/lookup', req(signal, { params })).then(unwrap),
  // The next free running SKU (AP-001, AP-002...), used to pre-fill the wizard.
  nextSku: () => api.get('/perfumes/next-sku').then(unwrap),
  get: (id) => api.get(`/perfumes/${id}`).then(unwrap),
  create: (payload) => api.post('/perfumes', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/perfumes/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/perfumes/${id}`).then((r) => r.data),

  // ── Stock top-ups ── Every one of these ADDS grams to what is on hand; none of them sets a total.
  // One row per perfume; with no `q` it answers with what needs restocking.
  stockSearch: (params) => api.get('/perfumes/stock/search', { params }).then(unwrapFull),
  resolveStockNames: (names) => api.post('/perfumes/stock/resolve', { names }).then(unwrap),
  // `source` only labels the audit line on each perfume — 'single' when the
  // one-perfume screen sent it, 'bulk' when a reviewed sheet did.
  bulkAddStock: (items, source = 'bulk') =>
    api.post('/perfumes/stock/bulk', { items, source }).then((r) => r.data),

  priceSearch: (params) => api.get('/perfumes/price/search', { params }).then(unwrapFull),
  resolvePriceNames: (names) => api.post('/perfumes/price/resolve', { names }).then(unwrap),
  bulkUpdatePrices: (items, source = 'bulk') =>
    api.post('/perfumes/price/bulk', { items, source }).then((r) => r.data),

  // ── Bulk catalogue upload ── Creating perfumes from a sheet, rather than one at a time in the wizard.
  previewBulkCreate: (names) => api.post('/perfumes/bulk/preview', { names }).then(unwrap),
  bulkCreatePerfumes: (items) => api.post('/perfumes/bulk', { items }).then((r) => r.data),
};

/* ─────────────────────────────── Bills ─────────────────────────────── */
export const billApi = {
  list: (params, signal) => api.get('/bills', req(signal, { params })).then(unwrapFull),
  stats: (params, signal) => api.get('/bills/stats', req(signal, { params })).then(unwrap),
  get: (id, signal) => api.get(`/bills/${id}`, req(signal)).then(unwrap),
  // Recalls past customers by contact number (exact) or name/number fragment (q).
  lookupCustomers: (params, signal) => api.get('/bills/customers', req(signal, { params })).then(unwrap),
  create: (payload) => api.post('/bills', payload).then((r) => r.data),
  setStatus: (id, payload) => api.patch(`/bills/${id}/status`, payload).then((r) => r.data),
  // Records money collected against a bill that already exists. Never creates a
  // second bill, and never moves stock.
  collectPayment: (id, payload) => api.patch(`/bills/${id}/payment`, payload).then((r) => r.data),
};

/* ─────────────────────────────── Users ─────────────────────────────── */
export const userApi = {
  list: (params, signal) => api.get('/users', req(signal, { params })).then(unwrapFull),
  create: (payload) => api.post('/users', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/users/${id}`, payload).then((r) => r.data),
  toggleStatus: (id) => api.patch(`/users/${id}/status`).then((r) => r.data),
  resetPassword: (id, password) => api.post(`/users/${id}/reset-password`, { password }).then((r) => r.data),
};

/* ─────────────────────────────── Branches ─────────────────────────────── */
export const branchApi = {
  list: (params) => api.get('/branches', { params }).then(unwrapFull),
  create: (payload) => api.post('/branches', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/branches/${id}`, payload).then((r) => r.data),
  toggleStatus: (id) => api.patch(`/branches/${id}/status`).then((r) => r.data),
  remove: (id) => api.delete(`/branches/${id}`).then((r) => r.data),
  // kind is 'logo' | 'favicon' — the same pair the store carries.
  uploadBranding: (id, kind, file, onProgress) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post(`/branches/${id}/branding/${kind}`, form, withProgress(onProgress))
      .then((r) => r.data);
  },
  removeBranding: (id, kind) => api.delete(`/branches/${id}/branding/${kind}`).then((r) => r.data),
};

/* ─────────────────────────────── Geo (address directory) ─────────────────────────────── */
export const geoApi = {
  states: (country) => api.get('/geo/states', { params: { country } }).then(unwrap),
  cities: (country, state) => api.get('/geo/cities', { params: { country, state } }).then(unwrap),
  postalCode: (country, code) => api.get('/geo/postal-code', { params: { country, code } }).then(unwrap),
};

/* ─────────────────────────────── Settings ─────────────────────────────── */
export const settingsApi = {
  get: () => api.get('/settings').then(unwrap),
  getPublic: () => api.get('/settings/public').then(unwrap),
  update: (payload) => api.patch('/settings', payload).then((r) => r.data),
  uploadBranding: (kind, file, onProgress) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post(`/settings/branding/${kind}`, form, withProgress(onProgress))
      .then((r) => r.data);
  },
  removeBranding: (kind) => api.delete(`/settings/branding/${kind}`).then((r) => r.data),
};

/* ─────────────────────────────── Uploads ─────────────────────────────── */
export const uploadApi = {
  upload: (files, folder = 'perfumes', onProgress) => {
    const form = new FormData();
    [...files].forEach((file) => form.append('files', file));
    form.append('folder', folder);
    return api.post('/uploads', form, withProgress(onProgress)).then(unwrap);
  },
  remove: (publicId, resourceType = 'image') =>
    api.delete('/uploads', { data: { publicId, resourceType } }).then((r) => r.data),
};
