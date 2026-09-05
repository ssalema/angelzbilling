import api from './client.js';

/** One thin module per resource. Every call returns the unwrapped payload. */

const unwrap = (response) => response.data?.data;
const unwrapFull = (response) => ({ items: response.data?.data ?? [], meta: response.data?.meta ?? {} });
const message = (response) => response.data?.message;

/* ─────────────────────────────── Auth ─────────────────────────────── */
export const authApi = {
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data.data),
  logout: () => api.post('/auth/logout').then(message),
  me: () => api.get('/auth/me').then((r) => r.data.data.user),
  updateProfile: (payload) => api.patch('/auth/me', payload).then((r) => r.data.data.user),
  changePassword: (payload) => api.post('/auth/change-password', payload).then(message),
};

/* ─────────────────────────────── Dashboard ─────────────────────────────── */
export const dashboardApi = {
  summary: (params) => api.get('/dashboard/summary', { params }).then(unwrap),
  series: (params) => api.get('/dashboard/revenue-series', { params }).then(unwrap),
  billStatus: (params) => api.get('/dashboard/bill-status', { params }).then(unwrap),
  paymentMethods: (params) => api.get('/dashboard/payment-methods', { params }).then(unwrap),
  topPerfumes: (params) => api.get('/dashboard/top-perfumes', { params }).then(unwrap),
  recentBills: (params) => api.get('/dashboard/recent-bills', { params }).then(unwrap),
  lowStock: (params) => api.get('/dashboard/low-stock', { params }).then(unwrap),
};

/* ─────────────────────────────── Perfumes ─────────────────────────────── */
export const perfumeApi = {
  list: (params) => api.get('/perfumes', { params }).then(unwrapFull),
  facets: () => api.get('/perfumes/facets').then(unwrap),
  lookup: (params) => api.get('/perfumes/lookup', { params }).then(unwrap),
  // The next free running SKU (AP-001, AP-002...), used to pre-fill the wizard.
  nextSku: () => api.get('/perfumes/next-sku').then(unwrap),
  get: (id) => api.get(`/perfumes/${id}`).then(unwrap),
  create: (payload) => api.post('/perfumes', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/perfumes/${id}`, payload).then((r) => r.data),
  setStatus: (id, status) => api.patch(`/perfumes/${id}/status`, { status }).then((r) => r.data),
  remove: (id) => api.delete(`/perfumes/${id}`).then((r) => r.data),
};

/* ─────────────────────────────── Bills ─────────────────────────────── */
export const billApi = {
  list: (params) => api.get('/bills', { params }).then(unwrapFull),
  stats: (params) => api.get('/bills/stats', { params }).then(unwrap),
  get: (id) => api.get(`/bills/${id}`).then(unwrap),
  // Recalls past customers by contact number (exact) or name/number fragment (q).
  lookupCustomers: (params) => api.get('/bills/customers', { params }).then(unwrap),
  create: (payload) => api.post('/bills', payload).then((r) => r.data),
  setStatus: (id, payload) => api.patch(`/bills/${id}/status`, payload).then((r) => r.data),
};

/* ─────────────────────────────── Users ─────────────────────────────── */
export const userApi = {
  list: (params) => api.get('/users', { params }).then(unwrapFull),
  get: (id) => api.get(`/users/${id}`).then(unwrap),
  create: (payload) => api.post('/users', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/users/${id}`, payload).then((r) => r.data),
  toggleStatus: (id) => api.patch(`/users/${id}/status`).then((r) => r.data),
  resetPassword: (id, password) => api.post(`/users/${id}/reset-password`, { password }).then((r) => r.data),
  remove: (id) => api.delete(`/users/${id}`).then((r) => r.data),
};

/* ─────────────────────────────── Branches ─────────────────────────────── */
export const branchApi = {
  list: (params) => api.get('/branches', { params }).then(unwrapFull),
  get: (id) => api.get(`/branches/${id}`).then(unwrap),
  create: (payload) => api.post('/branches', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/branches/${id}`, payload).then((r) => r.data),
  toggleStatus: (id) => api.patch(`/branches/${id}/status`).then((r) => r.data),
  remove: (id) => api.delete(`/branches/${id}`).then((r) => r.data),
  uploadLogo: (id, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/branches/${id}/logo`, form).then((r) => r.data);
  },
  removeLogo: (id) => api.delete(`/branches/${id}/logo`).then((r) => r.data),
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
  uploadBranding: (kind, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/settings/branding/${kind}`, form).then((r) => r.data);
  },
  removeBranding: (kind) => api.delete(`/settings/branding/${kind}`).then((r) => r.data),
};

/* ─────────────────────────────── Uploads ─────────────────────────────── */
export const uploadApi = {
  upload: (files, folder = 'perfumes', onProgress) => {
    const form = new FormData();
    [...files].forEach((file) => form.append('files', file));
    form.append('folder', folder);
    return api
      .post('/uploads', form, {
        onUploadProgress: (event) => {
          if (onProgress && event.total) onProgress(Math.round((event.loaded * 100) / event.total));
        },
      })
      .then(unwrap);
  },
  remove: (publicId, resourceType = 'image') =>
    api.delete('/uploads', { data: { publicId, resourceType } }).then((r) => r.data),
};
