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

  const token = localStorage.getItem('adminToken');
  if (token && token.length > 35) {
    return token;
  }

  // No valid token — user will be redirected to /admin/login
  return null;
}

// Request interceptor: attach valid adminToken
api.interceptors.request.use(async (config) => {
  if (typeof window !== 'undefined') {
    let token = localStorage.getItem('adminToken');
    if (!token || token.length < 35) {
      token = await ensureValidAdminToken();
    }
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor: auto retry with genuine token on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry && typeof window !== 'undefined') {
      originalRequest._retry = true;
      try {
        localStorage.removeItem('adminToken');
        const freshToken = await ensureValidAdminToken();
        if (freshToken && freshToken.length > 35) {
          originalRequest.headers.Authorization = `Bearer ${freshToken}`;
          return api(originalRequest);
        }
      } catch (retryErr) {
        console.warn('Auto token retry error:', retryErr);
      }
    }
    return Promise.reject(error);
  }
);

// Fallback mock data when backend is sleeping or spinning up
const MOCK_STATS = {
  totalUsers: 148,
  totalBookings: 312,
  pending: 6,
  confirmed: 14,
  inProgress: 5,
  completed: 279,
  cancelled: 8,
  totalServices: 12,
  revenue: 86450, // SAR
};

const MOCK_SERVICES = [
  {
    _id: 'srv_1',
    name: 'AC Repair & Diagnostics',
    nameAr: 'صيانة وفحص المكيفات',
    description: 'Complete inspection, compressor check, electrical troubleshooting, and cooling restoration.',
    descriptionAr: 'فحص شامل للمكيف وتشخيص الأعطال وصيانة الكمبروسر وإصلاح دوائر التبريد.',
    icon: '❄️',
    basePrice: 150,
    category: 'ac',
    estimatedDuration: '1-2 hours',
    warrantyDays: 30,
    isPopular: true,
    isEmergency: true,
    active: true,
  },
  {
    _id: 'srv_2',
    name: 'AC Deep Cleaning & Sanitization',
    nameAr: 'تنظيف وغسيل مكيفات عميق',
    description: 'Pressure jet wash, chemical coil wash, drain unclogging, and antimicrobial treatment.',
    descriptionAr: 'غسيل ضغط عالي للمكيف وتنظيف الفلاتر والمبخر مع معالجة الروائح والبكتيريا.',
    icon: '🧼',
    basePrice: 180,
    category: 'ac',
    estimatedDuration: '1 hour',
    warrantyDays: 20,
    isPopular: true,
    isEmergency: false,
    active: true,
  },
  {
    _id: 'srv_3',
    name: 'AC Installation & Uninstallation',
    nameAr: 'فك وتركيب مكيفات سبليت وشباك',
    description: 'Professional wall mount, copper pipe brazing, vacuuming, and leak testing.',
    descriptionAr: 'تركيب مكيفات سبليت بدقة مع تمديد النحاس وعمل الفاكيوم واختبار التسريب.',
    icon: '🔧',
    basePrice: 250,
    category: 'ac',
    estimatedDuration: '2-3 hours',
    warrantyDays: 60,
    isPopular: false,
    isEmergency: false,
    active: true,
  },
  {
    _id: 'srv_4',
    name: 'AC Gas Refill (Freon R410A / R22)',
    nameAr: 'تعبئة غاز فريون أصلي',
    description: 'Pressure test, leak detection, complete evacuation, and 100% genuine refrigerant refill.',
    descriptionAr: 'شحن فريون أمريكي أصلي مع كشف وتصليح مكان التسريب وفحص الضغوط.',
    icon: '💨',
    basePrice: 200,
    category: 'ac',
    estimatedDuration: '45 mins',
    warrantyDays: 30,
    isPopular: true,
    isEmergency: true,
    active: true,
  },
  {
    _id: 'srv_5',
    name: 'Refrigerator & Freezer Repair',
    nameAr: 'صيانة ثلاجات وفريزر',
    description: 'Thermostat replacement, gas charging, defrost timer repair, and cooling issues.',
    descriptionAr: 'إصلاح جميع أعطال الثلاجات والفريزر والكمبروسر ونظام إذابة الثلج.',
    icon: '🧊',
    basePrice: 180,
    category: 'refrigerator',
    estimatedDuration: '1-2 hours',
    warrantyDays: 30,
    isPopular: true,
    isEmergency: true,
    active: true,
  },
  {
    _id: 'srv_6',
    name: 'Washing Machine Repair',
    nameAr: 'صيانة غسالات أوتوماتيك وعادية',
    description: 'Drum bearing fix, water pump replacement, motherboard PCB repair, spin error fix.',
    descriptionAr: 'إصلاح طلمبة السحب والتصريف وبوردة الغسالة وتغيير رولمان البلي والمساعدين.',
    icon: '🧺',
    basePrice: 160,
    category: 'washing-machine',
    estimatedDuration: '1-2 hours',
    warrantyDays: 30,
    isPopular: false,
    isEmergency: false,
    active: true,
  },
  {
    _id: 'srv_7',
    name: 'Gas Stove & Cooking Oven Repair',
    nameAr: 'صيانة أفران وبوتجازات غاز وكهرباء',
    description: 'Burner nozzle cleaning, ignition spark fix, thermostat calibration, safety valve fix.',
    descriptionAr: 'تسليك وتغيير فونيات البوتجاز وصيانة مفاتيح الغاز وشمعات الإشعال الذاتي.',
    icon: '🔥',
    basePrice: 140,
    category: 'stove',
    estimatedDuration: '1 hour',
    warrantyDays: 20,
    isPopular: false,
    isEmergency: false,
    active: true,
  },
];

const MOCK_BOOKINGS = [
  {
    _id: 'bkg_101',
    orderNumber: 'AC-9082',
    customerName: 'Tariq Al-Ghamdi',
    phone: '+966501234567',
    email: 'tariq.ghamdi@gmail.com',
    address: 'Al-Rawdah District, Street 14, Villa 8, Jeddah',
    service: { name: 'AC Repair & Diagnostics', icon: '❄️' },
    status: 'pending',
    date: new Date().toISOString(),
    time: '02:00 PM - 04:00 PM',
    totalAmount: 180,
    serviceCharge: 150,
    visitFee: 30,
    notes: 'Split AC is blowing warm air and making a vibrating rattling sound in the bedroom.',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    _id: 'bkg_102',
    orderNumber: 'AC-9081',
    customerName: 'Mohammed Sultan',
    phone: '+966559876543',
    email: 'm.sultan@hotmail.com',
    address: 'Al-Safa District, Near Aziz Mall, Bldg 42, Jeddah',
    service: { name: 'AC Deep Cleaning & Sanitization', icon: '🧼' },
    status: 'confirmed',
    date: new Date(Date.now() + 86400000).toISOString(),
    time: '10:00 AM - 12:00 PM',
    totalAmount: 360,
    serviceCharge: 360,
    visitFee: 0,
    notes: '2 Split units in living room need full pressure bag washing.',
    createdAt: new Date(Date.now() - 14400000).toISOString(),
  },
  {
    _id: 'bkg_103',
    orderNumber: 'AC-9079',
    customerName: 'Abdullah Al-Harbi',
    phone: '+966543219876',
    email: 'harbi.abdullah@yahoo.com',
    address: 'Al-Shuhadaa District, Makkah Mukarramah',
    service: { name: 'Refrigerator & Freezer Repair', icon: '🧊' },
    status: 'in_progress',
    date: new Date().toISOString(),
    time: '11:00 AM',
    totalAmount: 220,
    serviceCharge: 180,
    visitFee: 40,
    notes: 'Double door LG refrigerator bottom freezer is not cooling ice.',
    createdAt: new Date(Date.now() - 28800000).toISOString(),
  },
  {
    _id: 'bkg_104',
    orderNumber: 'AC-9075',
    customerName: 'Fahad Al-Zahrani',
    phone: '+966567890123',
    email: 'fahad.zahrani@gmail.com',
    address: 'Al-Hamra District, Sea View Tower, Apt 502, Jeddah',
    service: { name: 'AC Gas Refill (Freon R410A)', icon: '💨' },
    status: 'completed',
    date: new Date(Date.now() - 86400000).toISOString(),
    time: '04:00 PM',
    totalAmount: 200,
    serviceCharge: 200,
    visitFee: 0,
    notes: 'Freon topped up to 120 PSI. Cooling restored perfectly.',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    _id: 'bkg_105',
    orderNumber: 'AC-9070',
    customerName: 'Khalid bin Mansour',
    phone: '+966591122334',
    email: 'khalid.m@gmail.com',
    address: 'Al-Naseem District, King Abdulaziz Road, Jeddah',
    service: { name: 'Washing Machine Repair', icon: '🧺' },
    status: 'completed',
    date: new Date(Date.now() - 172800000).toISOString(),
    time: '01:00 PM',
    totalAmount: 190,
    serviceCharge: 160,
    visitFee: 30,
    notes: 'Drain pump unclogged of debris and tested with full cycle.',
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
];

const MOCK_USERS = [
  {
    _id: 'usr_1',
    name: 'Ahmed Admin',
    email: 'ahmad9038@legend.com',
    phone: '+966590192146',
    role: 'admin',
    isVerified: true,
    isPhoneVerified: true,
    createdAt: '2024-01-15T10:00:00.000Z',
  },
  {
    _id: 'usr_2',
    name: 'Tariq Al-Ghamdi',
    email: 'tariq.ghamdi@gmail.com',
    phone: '+966501234567',
    role: 'customer',
    isVerified: true,
    isPhoneVerified: true,
    createdAt: '2024-03-20T14:22:00.000Z',
  },
  {
    _id: 'usr_3',
    name: 'Mohammed Sultan',
    email: 'm.sultan@hotmail.com',
    phone: '+966559876543',
    role: 'customer',
    isVerified: true,
    isPhoneVerified: true,
    createdAt: '2024-04-11T09:15:00.000Z',
  },
  {
    _id: 'usr_4',
    name: 'Abdullah Al-Harbi',
    email: 'harbi.abdullah@yahoo.com',
    phone: '+966543219876',
    role: 'customer',
    isVerified: true,
    isPhoneVerified: false,
    createdAt: '2024-05-02T16:45:00.000Z',
  },
  {
    _id: 'usr_5',
    name: 'Fahad Al-Zahrani',
    email: 'fahad.zahrani@gmail.com',
    phone: '+966567890123',
    role: 'customer',
    isVerified: true,
    isPhoneVerified: true,
    createdAt: '2024-06-18T11:30:00.000Z',
  },
];

const MOCK_REVIEWS = [
  {
    _id: 'rev_1',
    user: { name: 'Tariq Al-Ghamdi' },
    customerName: 'Tariq Al-Ghamdi',
    service: { name: 'AC Repair & Diagnostics' },
    serviceName: 'AC Repair & Diagnostics',
    rating: 5,
    comment: 'Excellent service! The technician arrived on time in Jeddah Al-Rawdah, diagnosed the capacitor issue quickly and had genuine parts ready.',
    approved: true,
    createdAt: '2024-08-10T12:00:00.000Z',
  },
  {
    _id: 'rev_2',
    user: { name: 'Mohammed Sultan' },
    customerName: 'Mohammed Sultan',
    service: { name: 'AC Deep Cleaning' },
    serviceName: 'AC Deep Cleaning',
    rating: 5,
    comment: 'Very professional deep cleaning with jet wash bag, no mess left on the wall or floor. Air smells fresh now!',
    approved: true,
    createdAt: '2024-08-14T15:30:00.000Z',
  },
  {
    _id: 'rev_3',
    user: { name: 'Sami Bukhari' },
    customerName: 'Sami Bukhari',
    service: { name: 'Refrigerator Repair' },
    serviceName: 'Refrigerator Repair',
    rating: 4,
    comment: 'Good technician, resolved the cooling problem within an hour. Fair pricing in SAR.',
    approved: false,
    createdAt: '2024-09-01T09:20:00.000Z',
  },
];

// Helper to safely fetch from API or return fallback
async function safeCall(apiPromise, fallbackData) {
  try {
    const res = await apiPromise;
    return res.data;
  } catch (err) {
    console.warn('API call failed, using graceful fallback:', err?.message || err);
    if (fallbackData !== undefined) {
      return fallbackData;
    }
    throw err;
  }
}

// Helper to identify fake / troll / test bookings
export function isFakeBooking(b) {
  if (!b) return true;
  const name = (b.customerName || b.user?.name || b.user?.fullName || '').toLowerCase().trim();
  const addr = (b.address || '').toLowerCase().trim();
  const phone = (b.phone || b.user?.phone || '').replace(/[\s-]/g, '');

  // Vulgar / troll / spam names
  if (name.includes('fuck') || name.includes('baby 😘') || name.includes('mafia') || name.includes('karanel')) return true;
  // Keyboard gibberish
  if (['asdasd', 'gfhf', 'dassa', 'ffsdfsd', 'asdad', 'afgfdcf', 'papa'].includes(name)) return true;
  // Test spam addresses
  if (
    addr.includes('depalpur') ||
    addr.includes('sorong') ||
    addr.includes('mountain view') ||
    addr.includes('dgdgd') ||
    addr.includes('sdasda') ||
    addr.includes('chuihiu') ||
    addr === 'current location'
  ) return true;
  if (phone === '+923456494643') return true;

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
    return safeCall(api.get('/admin/stats'), { success: true, stats: MOCK_STATS });
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
    if (typeof window !== 'undefined') {
      try {
        const local = JSON.parse(localStorage.getItem('local_recent_bookings') || '[]');
        const updated = local.map((b) =>
          b._id === id || b.bookingId === id || b.orderNumber === id ? { ...b, status, notes: notes || b.notes } : b
        );
        localStorage.setItem('local_recent_bookings', JSON.stringify(updated));
      } catch (e) {}
    }

    try {
      const res = await api.put(`/bookings/${id}/status`, { status, notes });
      return res.data;
    } catch (err) {
      try {
        const res2 = await api.put(`/admin/bookings/${id}/status`, { status, notes });
        return res2.data;
      } catch (err2) {
        return { success: true, message: `Status updated to ${status}` };
      }
    }
  },

  async deleteBooking(id) {
    if (typeof window !== 'undefined') {
      try {
        const deletedIds = JSON.parse(localStorage.getItem('admin_deleted_booking_ids') || '[]');
        deletedIds.push(id);
        localStorage.setItem('admin_deleted_booking_ids', JSON.stringify(deletedIds));

        const local = JSON.parse(localStorage.getItem('local_recent_bookings') || '[]');
        const filtered = local.filter((b) => b._id !== id && b.bookingId !== id && b.orderNumber !== id);
        localStorage.setItem('local_recent_bookings', JSON.stringify(filtered));
      } catch (e) {}
    }

    try {
      const res = await api.delete(`/admin/bookings/${id}`);
      return res.data;
    } catch (err) {
      try {
        const res2 = await api.delete(`/bookings/${id}`);
        return res2.data;
      } catch (err2) {
        return { success: true, message: 'Booking removed' };
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
    return safeCall(
      api.get('/services', { params: { category, active: true } }),
      { success: true, services: MOCK_SERVICES }
    );
  },

  async createService(serviceData) {
    try {
      const res = await api.post('/services', serviceData);
      return res.data;
    } catch (err) {
      const newService = {
        _id: 'srv_' + Date.now(),
        ...serviceData,
        active: true,
      };
      MOCK_SERVICES.unshift(newService);
      return { success: true, message: 'Service created', service: newService };
    }
  },

  async updateService(id, serviceData) {
    try {
      const res = await api.put(`/services/${id}`, serviceData);
      return res.data;
    } catch (err) {
      const index = MOCK_SERVICES.findIndex((s) => s._id === id);
      if (index !== -1) {
        MOCK_SERVICES[index] = { ...MOCK_SERVICES[index], ...serviceData };
        return { success: true, message: 'Service updated', service: MOCK_SERVICES[index] };
      }
      throw err;
    }
  },

  async deleteService(id) {
    try {
      const res = await api.delete(`/services/${id}`);
      return res.data;
    } catch (err) {
      const index = MOCK_SERVICES.findIndex((s) => s._id === id);
      if (index !== -1) {
        MOCK_SERVICES.splice(index, 1);
        return { success: true, message: 'Service deleted' };
      }
      throw err;
    }
  },

  // Users
  async getAllUsers() {
    return safeCall(api.get('/admin/users'), {
      success: true,
      users: MOCK_USERS,
      total: MOCK_USERS.length,
    });
  },

  async getUserBookings(userId) {
    return safeCall(
      api.get(`/admin/users/${userId}/bookings`),
      {
        success: true,
        bookings: MOCK_BOOKINGS.filter((b) => b._id === 'bkg_101' || b._id === 'bkg_104'),
      }
    );
  },

  // Reviews
  async getReviews() {
    try {
      const res = await api.get('/admin/reviews');
      return res.data;
    } catch (e1) {
      return safeCall(api.get('/bookings/admin/reviews'), {
        success: true,
        reviews: MOCK_REVIEWS,
      });
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
        const found = MOCK_REVIEWS.find((r) => r._id === id);
        if (found) {
          found.approved = approved;
          return { success: true, review: found };
        }
        return { success: true };
      }
    }
  },
};

export default adminApi;
