// Admin API client for Ahmed Cooling Workshop.
//
// Every function returns `response.data`. On failure it throws AdminApiError with:
//   .status  HTTP status (0 = network error / timeout)
//   .message the server's message (or a readable fallback)
//   .errors  the server's field errors array, if any
// There are no fallback retries to other routes: one call = one request.
//
// A 401 from any call except login/changePassword runs the handler AdminAuthContext registers with
// setUnauthorizedHandler(): it clears the stored session and sends the admin to /admin/login?next=<path>.

import axios from 'axios';

const PROD_URL = 'https://ahmed-cooling-backend.onrender.com/api';
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || PROD_URL;

// ─────────────────────────────────────────
// Session storage of the admin token
// ─────────────────────────────────────────
// Trade-off: the token lives in localStorage (not sessionStorage) so a new tab opened from the panel
// stays signed in — QA reported having to sign in again for every tab. localStorage is readable by any
// script on this origin, so an XSS bug would expose it; that risk is limited by the site's CSP/security
// headers, the 8 h JWT lifetime (we also drop expired tokens here, before any request) and server-side
// revocation on password change. Logout and any 401 clear it everywhere.

const TOKEN_KEY = 'adminToken';
const USER_KEY = 'adminUser';
const EXPIRY_SKEW_MS = 30 * 1000; // treat a token as expired 30 s early so requests don't race the server

const hasWindow = () => typeof window !== 'undefined';

function decodeJwtPayload(token) {
  try {
    const part = String(token).split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

// A token we can use: three JWT segments, readable payload and (if it has one) an `exp` in the future
export function isTokenUsable(token) {
  if (!token || typeof token !== 'string' || token.split('.').length !== 3) return false;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  if (payload.exp != null && payload.exp * 1000 - EXPIRY_SKEW_MS <= Date.now()) return false;
  return true;
}

export function tokenExpiresAt(token) {
  const exp = decodeJwtPayload(token)?.exp;
  return exp ? exp * 1000 : null;
}

export function clearStoredSession() {
  if (!hasWindow()) return;
  for (const store of [localStorage, sessionStorage]) {
    try {
      store.removeItem(TOKEN_KEY);
      store.removeItem(USER_KEY);
    } catch { /* storage blocked */ }
  }
}

// { token, user } from storage, or null (expired / malformed sessions are removed)
export function readStoredSession() {
  if (!hasWindow()) return null;
  try {
    // One-time migration of a session saved by the older sessionStorage-only version
    if (!localStorage.getItem(TOKEN_KEY) && sessionStorage.getItem(TOKEN_KEY)) {
      localStorage.setItem(TOKEN_KEY, sessionStorage.getItem(TOKEN_KEY));
      const oldUser = sessionStorage.getItem(USER_KEY);
      if (oldUser) localStorage.setItem(USER_KEY, oldUser);
    }
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);

    const token = localStorage.getItem(TOKEN_KEY);
    if (!isTokenUsable(token)) {
      clearStoredSession();
      return null;
    }
    let user = null;
    try { user = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { user = null; }
    return { token, user };
  } catch {
    return null;
  }
}

export function storeSession(token, user) {
  if (!hasWindow()) return;
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user || null));
  } catch { /* storage blocked: the session lasts until reload */ }
}

let unauthorizedHandler = null;
// AdminAuthContext registers its logout here; returns an unregister function
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
  return () => {
    if (unauthorizedHandler === fn) unauthorizedHandler = null;
  };
}

// In-memory token (set by AdminAuthContext) so requests don't depend on storage being available
let memoryToken = null;
export function setApiToken(token) {
  memoryToken = token || null;
}

// ─────────────────────────────────────────
// Errors
// ─────────────────────────────────────────

export class AdminApiError extends Error {
  constructor(status, message, errors) {
    super(message || 'Request failed');
    this.name = 'AdminApiError';
    this.status = status;
    this.errors = Array.isArray(errors) ? errors : errors ? [errors] : undefined;
  }
}

function toAdminApiError(err) {
  if (err instanceof AdminApiError) return err;
  const res = err?.response;
  if (!res) {
    const timedOut = err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '');
    return new AdminApiError(
      0,
      timedOut ? 'The server took too long to respond. Please try again.' : 'Cannot reach the server. Check your connection and try again.'
    );
  }
  const data = res.data;
  let message = typeof data === 'string' && data.trim() && data.length < 300 && !/^\s*</.test(data) ? data.trim() : data?.message || data?.error;
  if (!message) {
    if (res.status === 429) message = 'Too many attempts. Please wait a few minutes and try again.';
    else if (res.status === 401) message = 'Your session has expired. Please sign in again.';
    else if (res.status === 403) message = 'You do not have permission to do this.';
    else if (res.status === 404) message = 'Not found.';
    else if (res.status >= 500) message = 'Server error. Please try again.';
    else message = `Request failed (${res.status})`;
  }
  return new AdminApiError(res.status, message, data?.errors);
}

// ─────────────────────────────────────────
// HTTP client
// ─────────────────────────────────────────

const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (hasWindow() && !config.skipAuth) {
    const token = memoryToken || readStoredSession()?.token;
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // A dropped connection (no response, not a timeout) on a read or the login is retried twice before failing
    const config = error?.config;
    const method = String(config?.method || 'get').toLowerCase();
    const dropped = !error?.response && error?.code !== 'ECONNABORTED' && error?.code !== 'ERR_CANCELED';
    const safe = method === 'get' || method === 'head' || /\/admin\/login$/.test(config?.url || '');
    if (config && dropped && safe && (config.__networkRetry || 0) < 2) {
      config.__networkRetry = (config.__networkRetry || 0) + 1;
      await new Promise((resolve) => setTimeout(resolve, 700 * config.__networkRetry));
      return api(config);
    }
    const status = error?.response?.status;
    if (status === 401 && !error?.config?.skipLogoutOn401 && hasWindow()) {
      clearStoredSession();
      memoryToken = null;
      try { unauthorizedHandler?.(); } catch { /* ignore */ }
    }
    return Promise.reject(toAdminApiError(error));
  }
);

const data = (promise) => promise.then((res) => res.data);
const id_ = (id) => encodeURIComponent(String(id));
// Drop empty params so the URL stays clean (status: '' / q: undefined …)
const clean = (params = {}) => Object.fromEntries(
  Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
);

// ─────────────────────────────────────────
// Auth
// ─────────────────────────────────────────

export const login = (email, password) =>
  data(api.post('/admin/login', { email, password }, { skipAuth: true, skipLogoutOn401: true }));

export const changePassword = (currentPassword, newPassword) =>
  data(api.post('/admin/change-password', { currentPassword, newPassword }, { skipLogoutOn401: true }));

// ─────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────

export const getStats = () => data(api.get('/admin/stats'));

// ─────────────────────────────────────────
// Bookings
// ─────────────────────────────────────────

// params: { page, limit, status, priority, q, from, to, sort, unassigned: '1', overdue: '1' }
export const getBookings = (params) => data(api.get('/admin/bookings', { params: clean(params) }));

export const getBooking = (id) => data(api.get(`/admin/bookings/${id_(id)}`));

export const updateBookingStatus = (id, status, { reason, expectedStatus } = {}) =>
  data(api.put(`/bookings/${id_(id)}/status`, clean({ status, reason, expectedStatus })));

export const assignTechnician = (id, technicianId) =>
  data(api.put(`/bookings/${id_(id)}/assign`, { technicianId }));

export const updatePayment = (id, { paymentStatus, paymentMethod } = {}) =>
  data(api.patch(`/admin/bookings/${id_(id)}/payment`, clean({ paymentStatus, paymentMethod })));

export const deleteBooking = (id) => data(api.delete(`/admin/bookings/${id_(id)}`));

export const getTechnicians = () => data(api.get('/admin/technicians'));

// ─────────────────────────────────────────
// Technicians — ids are the technician's User id
// ─────────────────────────────────────────

// Same endpoint as getTechnicians: each technician carries cities, specialties, autoAssign and stats
export const getTechniciansFull = () => data(api.get('/admin/technicians'));

// → technician + stats + jobs (recent 50) + settlements
export const getTechnician = (id) => data(api.get(`/admin/technicians/${id_(id)}`));

// { fullName, phone, email?, password, cities[], specialties[], autoAssign, active }
export const createTechnician = (payload) => data(api.post('/admin/technicians', payload));

// Any subset of the create fields + availability; `password` resets it
export const updateTechnician = (id, patch) => data(api.patch(`/admin/technicians/${id_(id)}`, patch));

export const getSettlements = (id) => data(api.get(`/admin/technicians/${id_(id)}/settlements`));

// { amount, method: 'cash'|'bank_transfer'|'other', note }
export const addSettlement = (id, payload) => data(api.post(`/admin/technicians/${id_(id)}/settlements`, payload));

// ─────────────────────────────────────────
// App settings
// ─────────────────────────────────────────

// → { commissionRate } as a fraction (0.07 = 7%)
export const getSettings = () => data(api.get('/admin/settings'));

export const updateSettings = (patch) => data(api.put('/admin/settings', patch));

// ─────────────────────────────────────────
// Users
// ─────────────────────────────────────────

// params: { page, limit, q, role }
export const getUsers = (params) => data(api.get('/admin/users', { params: clean(params) }));

export const getUserBookings = (userId) => data(api.get(`/admin/users/${id_(userId)}/bookings`));

// ─────────────────────────────────────────
// Services
// ─────────────────────────────────────────

export const getAdminServices = () => data(api.get('/admin/services'));

export const createService = (serviceData) => data(api.post('/services', serviceData));

export const updateService = (id, serviceData) => data(api.put(`/services/${id_(id)}`, serviceData));

export const setServiceActive = (id, active) => data(api.put(`/services/${id_(id)}`, { active: !!active }));

// DELETE /services/:id deactivates (the service is kept) — call it "Deactivate" in the UI
export const deactivateService = (id) => data(api.delete(`/services/${id_(id)}`));

// ─────────────────────────────────────────
// Reviews, inquiries, ratings
// ─────────────────────────────────────────

// params: { status: 'pending'|'approved'|'all', page, limit }
export const getReviews = (params) => data(api.get('/admin/reviews', { params: clean(params) }));

export const setReviewApproved = (id, approved) =>
  data(api.put(`/admin/reviews/${id_(id)}/approve`, { approved: approved === true }));

// params: { status: 'new'|'handled'|'all', page, limit }
export const getInquiries = (params) => data(api.get('/admin/inquiries', { params: clean(params) }));

export const setInquiryStatus = (id, status) => data(api.patch(`/admin/inquiries/${id_(id)}`, { status }));

// params: { page, limit }
export const getRatings = (params) => data(api.get('/admin/ratings', { params: clean(params) }));

// ─────────────────────────────────────────
// WhatsApp inbox
// ─────────────────────────────────────────
// params: { status: 'bot'|'needs_human'|'human' } — omit for every conversation
export const getWhatsAppConversations = (params) => data(api.get('/admin/whatsapp/conversations', { params: clean(params) }));

export const getWhatsAppMessages = (phone) => data(api.get(`/admin/whatsapp/conversations/${id_(phone)}/messages`));

export const sendWhatsAppReply = (phone, message) =>
  data(api.post(`/admin/whatsapp/conversations/${id_(phone)}/reply`, { message }));

export const releaseWhatsAppConversation = (phone) =>
  data(api.post(`/admin/whatsapp/conversations/${id_(phone)}/release`));

// Object form for `import { adminApi } from '../adminApi'` / `import adminApi from '../adminApi'`
export const adminApi = {
  login,
  changePassword,
  getStats,
  getBookings,
  getBooking,
  updateBookingStatus,
  assignTechnician,
  updatePayment,
  deleteBooking,
  getTechnicians,
  getTechniciansFull,
  getTechnician,
  createTechnician,
  updateTechnician,
  getSettlements,
  addSettlement,
  getSettings,
  updateSettings,
  getUsers,
  getUserBookings,
  getAdminServices,
  createService,
  updateService,
  setServiceActive,
  deactivateService,
  getReviews,
  setReviewApproved,
  getInquiries,
  setInquiryStatus,
  getRatings,
  getWhatsAppConversations,
  getWhatsAppMessages,
  sendWhatsAppReply,
  releaseWhatsAppConversation,
};

export default adminApi;
