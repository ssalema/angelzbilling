import api from './client.js';
import { compressImage } from '../utils/compressImage.js';

const req = (signal, config = {}) => (signal ? { ...config, signal } : config);

// Reusing the key on a retry makes the server replay the first result instead of writing twice.
const once = (key) => (key ? { headers: { 'Idempotency-Key': key } } : undefined);

const unwrap = (response) => response.data?.data;
const unwrapFull = (response) => ({ items: response.data?.data ?? [], meta: response.data?.meta ?? {} });
const message = (response) => response.data?.message;

const withProgress = (onProgress) =>
  onProgress
    ? {
        onUploadProgress: (event) => {
          if (event.total) onProgress(Math.round((event.loaded * 100) / event.total));
        },
      }
    : undefined;

export const authApi = {
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data.data),
  logout: () => api.post('/auth/logout').then(message),
  me: () => api.get('/auth/me').then((r) => r.data.data.user),
  updateProfile: (payload) => api.patch('/auth/me', payload).then((r) => r.data.data.user),
  uploadAvatar: async (file, onProgress) => {
    const form = new FormData();
    // Avatars are shown small, so shrink before upload.
    form.append('file', await compressImage(file, { maxEdge: 800 }));
    return api.post('/auth/me/avatar', form, withProgress(onProgress)).then((r) => r.data);
  },
  removeAvatar: () => api.delete('/auth/me/avatar').then((r) => r.data),
  changePassword: (payload) => api.post('/auth/change-password', payload).then(message),
};

export const dashboardApi = {
  // All widgets in one request on load; per-widget calls are for a card's own range.
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

export const perfumeApi = {
  list: (params, signal) => api.get('/perfumes', req(signal, { params })).then(unwrapFull),
  facets: (signal) => api.get('/perfumes/facets', req(signal)).then(unwrap),
  // Called on every keystroke while billing, so pass a signal to cancel stale calls.
  lookup: (params, signal) => api.get('/perfumes/lookup', req(signal, { params })).then(unwrap),
  // Next free SKU (AP-001, AP-002...) to pre-fill the wizard.
  nextSku: () => api.get('/perfumes/next-sku').then(unwrap),
  get: (id) => api.get(`/perfumes/${id}`).then(unwrap),
  create: (payload) => api.post('/perfumes', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/perfumes/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/perfumes/${id}`).then((r) => r.data),

  // Stock updates ADD grams to what is on hand; they never set a total.
  // With no `q`, stockSearch returns what needs restocking.
  stockSearch: (params) => api.get('/perfumes/stock/search', { params }).then(unwrapFull),
  resolveStockNames: (names) => api.post('/perfumes/stock/resolve', { names }).then(unwrap),
  // `source` ('single' | 'bulk') only labels the audit entry.
  bulkAddStock: (items, source = 'bulk', key) =>
    api.post('/perfumes/stock/bulk', { items, source }, once(key)).then((r) => r.data),

  priceSearch: (params) => api.get('/perfumes/price/search', { params }).then(unwrapFull),
  resolvePriceNames: (names) => api.post('/perfumes/price/resolve', { names }).then(unwrap),
  bulkUpdatePrices: (items, source = 'bulk', key) =>
    api.post('/perfumes/price/bulk', { items, source }, once(key)).then((r) => r.data),

  // Bulk catalogue upload from a sheet.
  previewBulkCreate: (names) => api.post('/perfumes/bulk/preview', { names }).then(unwrap),
  bulkCreatePerfumes: (items, key) => api.post('/perfumes/bulk', { items }, once(key)).then((r) => r.data),
};

export const billApi = {
  list: (params, signal) => api.get('/bills', req(signal, { params })).then(unwrapFull),
  stats: (params, signal) => api.get('/bills/stats', req(signal, { params })).then(unwrap),
  get: (id, signal) => api.get(`/bills/${id}`, req(signal)).then(unwrap),
  // Recalls past customers by contact number (exact) or name/number fragment (q).
  lookupCustomers: (params, signal) => api.get('/bills/customers', req(signal, { params })).then(unwrap),
  create: (payload, key) => api.post('/bills', payload, once(key)).then((r) => r.data),
  setStatus: (id, payload, key) => api.patch(`/bills/${id}/status`, payload, once(key)).then((r) => r.data),
  // Records a payment on an existing bill. Never creates a bill or moves stock.
  collectPayment: (id, payload, key) =>
    api.patch(`/bills/${id}/payment`, payload, once(key)).then((r) => r.data),
};

export const userApi = {
  list: (params, signal) => api.get('/users', req(signal, { params })).then(unwrapFull),
  create: (payload) => api.post('/users', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/users/${id}`, payload).then((r) => r.data),
  toggleStatus: (id) => api.patch(`/users/${id}/status`).then((r) => r.data),
  resetPassword: (id, password) => api.post(`/users/${id}/reset-password`, { password }).then((r) => r.data),
};

export const branchApi = {
  list: (params) => api.get('/branches', { params }).then(unwrapFull),
  create: (payload) => api.post('/branches', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/branches/${id}`, payload).then((r) => r.data),
  toggleStatus: (id) => api.patch(`/branches/${id}/status`).then((r) => r.data),
  remove: (id) => api.delete(`/branches/${id}`).then((r) => r.data),
  // kind is 'logo' | 'favicon'.
  uploadBranding: (id, kind, file, onProgress) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post(`/branches/${id}/branding/${kind}`, form, withProgress(onProgress))
      .then((r) => r.data);
  },
  removeBranding: (id, kind) => api.delete(`/branches/${id}/branding/${kind}`).then((r) => r.data),
};

export const geoApi = {
  states: (country) => api.get('/geo/states', { params: { country } }).then(unwrap),
  cities: (country, state) => api.get('/geo/cities', { params: { country, state } }).then(unwrap),
  postalCode: (country, code) => api.get('/geo/postal-code', { params: { country, code } }).then(unwrap),
};

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

export const uploadApi = {
  upload: async (files, folder = 'perfumes', onProgress) => {
    const form = new FormData();
    // Videos and PNGs pass through untouched; see utils/compressImage.js.
    const prepared = await Promise.all([...files].map((file) => compressImage(file)));
    prepared.forEach((file) => form.append('files', file));
    form.append('folder', folder);
    return api.post('/uploads', form, withProgress(onProgress)).then(unwrap);
  },
  remove: (publicId, resourceType = 'image') =>
    api.delete('/uploads', { data: { publicId, resourceType } }).then((r) => r.data),
};
