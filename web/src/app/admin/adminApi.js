// Admin API Client for Ahmed Cooling Workshop
import axios from 'axios';

const PROD_URL = 'https://ahmed-cooling-backend.onrender.com/api';
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || PROD_URL;
const FALLBACK_URL = PROD_URL;

const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Shared promise to prevent concurrent login requests
let loginPromise = null;

export async function ensureValidAdminToken() {
  if (typeof window === 'undefined') return null;

  // Clear any persistent localStorage residue
  try { localStorage.removeItem('adminToken'); } catch (e) {}

  // Read only from current active browser tab session
  const token = sessionStorage.getItem('adminToken');
  if (token && token.length > 35) {
    return token;
  }

  // No valid token — user will be redirected to /admin/login
  return null;
}

// Request interceptor: attach valid adminToken from sessionStorage
api.interceptors.request.use(async (config) => {
  if (typeof window !== 'undefined') {
    let token = sessionStorage.getItem('adminToken');
    if (!token || token.length < 35) {
      token = await ensureValidAdminToken();
    }
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor: on 401, clear session and reject (no infinite retry)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      // Token is invalid/expired — clear session, user must re-login
      sessionStorage.removeItem('adminToken');
      sessionStorage.removeItem('adminUser');
      localStorage.removeItem('adminToken');
      console.warn('Admin token expired or invalid — session cleared');
    }
    return Promise.reject(error);
  }
);

// Helper to fetch from API — no silent mock fallbacks
async function safeCall(apiPromise) {
  try {
    const res = await apiPromise;
    return res.data;
  } catch (err) {
    const message = err?.response?.data?.message || err?.message || 'Server request failed';
    console.error('API call failed:', message);
    throw new Error(message);
  }
}

// Helper to identify fake / troll / test bookings
export function isFakeBooking(b) {
  if (!b) return true;
  const name = (b.customerName || b.user?.name || b.user?.fullName || '').toLowerCase().trim();
  const addr = (b.address || '').toLowerCase().trim();
  const phone = (b.phone || b.user?.phone || '').replace(/[\s-]/g, '');

  // Obvious test/spam names & keyboard mashing
  if (['test', 'testing', 'asdasd', 'qwerty', 'fake'].includes(name)) return true;
  if (/^([a-z])\1{4,}$/i.test(name)) return true;

  // Placeholder test addresses
  if (['test', 'test address', 'dummy', 'current location'].includes(addr)) return true;

  return false;
}

// ─────────────────────────────────────────
// EXPORTED ADMIN API METHODS
// ─────────────────────────────────────────

export const adminApi = {
  isFakeBooking,

  // Authentication
  async login(email, password) {
    try {
      // Try /auth/login first
      const res = await api.post('/auth/login', { email, password });
      return res.data;
    } catch (err) {
      // Try /admin/login as fallback
      try {
        const res2 = await api.post('/admin/login', { email, password });
        return res2.data;
      } catch (err2) {
        const message =
          err?.response?.data?.message ||
          err2?.response?.data?.message ||
          'Authentication failed. Please check your credentials.';
        throw new Error(message);
      }
    }
  },

  // Dashboard Stats
  async getStats() {
    return safeCall(api.get('/admin/stats'));
  },

  // Bookings
  async getAllBookings(status = 'all', page = 1, limit = 50) {
    try {
      await ensureValidAdminToken();
      const res = await api.get('/admin/bookings', { params: { status, page, limit } });
      let serverBookings = res.data?.bookings || res.data?.data || [];

      // Exclude any deleted bookings
      let deletedIds = new Set();
      if (typeof window !== 'undefined') {
        try {
          const stored = JSON.parse(localStorage.getItem('admin_deleted_booking_ids') || '[]');
          deletedIds = new Set(stored.map((x) => String(x).toLowerCase()));
        } catch (e) {}
      }

      // Show all genuine bookings directly from DB
      serverBookings = serverBookings.filter((b) => {
        const idKey = String(b._id || b.bookingId || b.orderNumber || '').toLowerCase();
        if (deletedIds.has(idKey)) return false;
        return true;
      });

      // Prepend any locally placed bookings if not already present
      if (typeof window !== 'undefined') {
        try {
          const localBookings = JSON.parse(localStorage.getItem('local_recent_bookings') || '[]');
          if (Array.isArray(localBookings) && localBookings.length > 0) {
            const existingKeys = new Set(
              serverBookings.map((b) => (b.bookingId || b.orderNumber || b._id || '').toLowerCase())
            );
            const freshLocal = localBookings.filter(
              (b) =>
                !existingKeys.has((b.bookingId || b.orderNumber || b._id || '').toLowerCase()) &&
                !deletedIds.has(String(b._id || b.bookingId || b.orderNumber).toLowerCase())
            );
            serverBookings = [...freshLocal, ...serverBookings];
          }
        } catch (e) {
          console.warn('Error merging local bookings:', e);
        }
      }

      return {
        success: true,
        bookings: serverBookings,
        pagination: res.data?.pagination || { total: serverBookings.length, page: 1, pages: 1 },
      };
    } catch (err) {
      console.warn('Error fetching server bookings:', err?.message || err);
      let localList = [];
      if (typeof window !== 'undefined') {
        try {
          localList = JSON.parse(localStorage.getItem('local_recent_bookings') || '[]');
          localList = localList.filter((b) => !isFakeBooking(b));
        } catch (e) {}
      }
      return {
        success: true,
        bookings: localList,
        pagination: { total: localList.length, page: 1, pages: 1 },
      };
    }
  },

  async updateBookingStatus(id, status, notes = '') {
    try {
      const res = await api.put(`/bookings/${id}/status`, { status, notes });
      return res.data;
    } catch (err) {
      try {
        const res2 = await api.put(`/admin/bookings/${id}/status`, { status, notes });
        return res2.data;
      } catch (err2) {
        const message = err2?.response?.data?.message || err?.response?.data?.message || 'Failed to update booking status';
        throw new Error(message);
      }
    }
  },

  async deleteBooking(id) {
    try {
      const res = await api.delete(`/admin/bookings/${id}`);
      return res.data;
    } catch (err) {
      try {
        const res2 = await api.delete(`/bookings/${id}`);
        return res2.data;
      } catch (err2) {
        const message = err2?.response?.data?.message || err?.response?.data?.message || 'Failed to delete booking';
        throw new Error(message);
      }
    }
  },

  async confirmBooking(id) {
    return this.updateBookingStatus(id, 'confirmed');
  },

  async cancelBooking(id, reason = 'Cancelled by admin') {
    return this.updateBookingStatus(id, 'cancelled', reason);
  },

  // Services
  async getServices(category) {
    return safeCall(api.get('/services', { params: { category, active: true } }));
  },

  async createService(serviceData) {
    const res = await api.post('/services', serviceData);
    return res.data;
  },

  async updateService(id, serviceData) {
    const res = await api.put(`/services/${id}`, serviceData);
    return res.data;
  },

  async deleteService(id) {
    const res = await api.delete(`/services/${id}`);
    return res.data;
  },

  // Users
  async getAllUsers() {
    return safeCall(api.get('/admin/users'));
  },

  async getUserBookings(userId) {
    return safeCall(api.get(`/admin/users/${userId}/bookings`));
  },

  // Reviews
  async getReviews() {
    try {
      const res = await api.get('/admin/reviews');
      return res.data;
    } catch (e1) {
      return safeCall(api.get('/bookings/admin/reviews'));
    }
  },

  async approveReview(id, approved) {
    try {
      const res = await api.put(`/admin/reviews/${id}/approve`, { approved });
      return res.data;
    } catch (err) {
      try {
        const res2 = await api.put(`/bookings/admin/reviews/${id}/approve`, { approved });
        return res2.data;
      } catch (err2) {
        const message = err2?.response?.data?.message || err?.response?.data?.message || 'Failed to update review';
        throw new Error(message);
      }
    }
  },
};

export default adminApi;
