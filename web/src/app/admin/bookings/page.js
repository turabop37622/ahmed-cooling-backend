'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { adminApi } from '../adminApi';
import {
  ClipboardList,
  Search,
  RefreshCw,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  X,
  MessageCircle,
  ExternalLink,
  ChevronRight,
  Filter,
  Check,
  Ban,
  User,
  Wrench,
  DollarSign,
  Loader2,
  Snowflake,
  Refrigerator,
  WashingMachine,
  Flame,
  Sparkles,
  Wind,
  Zap,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

function renderServiceOutlineIcon(service, serviceName, size = 'sm') {
  const text = ((service?.name || '') + ' ' + (serviceName || '') + ' ' + (service?.category || '')).toLowerCase();
  const iconSize = size === 'lg' ? 'w-6 h-6 stroke-[1.8]' : 'w-4 h-4 stroke-[1.8]';
  const boxSize = size === 'lg' ? 'w-12 h-12 rounded-2xl' : 'w-8 h-8 rounded-xl';

  if (text.includes('clean') || text.includes('jet') || text.includes('sanitiz') || text.includes('غسيل')) {
    return (
      <div className={`${boxSize} bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200/60 dark:border-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0`}>
        <Sparkles className={iconSize} />
      </div>
    );
  }
  if (text.includes('wash') || text.includes('laundry') || text.includes('غسال')) {
    return (
      <div className={`${boxSize} bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200/60 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0`}>
        <WashingMachine className={iconSize} />
      </div>
    );
  }
  if (text.includes('ref') || text.includes('fridge') || text.includes('freezer') || text.includes('ثلاج') || text.includes('ice')) {
    return (
      <div className={`${boxSize} bg-teal-50 dark:bg-teal-500/10 border border-teal-200/60 dark:border-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0`}>
        <Refrigerator className={iconSize} />
      </div>
    );
  }
  if (text.includes('gas') || text.includes('freon') || text.includes('فريون')) {
    return (
      <div className={`${boxSize} bg-sky-50 dark:bg-sky-500/10 border border-sky-200/60 dark:border-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0`}>
        <Wind className={iconSize} />
      </div>
    );
  }
  if (text.includes('stove') || text.includes('oven') || text.includes('cook') || text.includes('فرن') || text.includes('بوتجاز')) {
    return (
      <div className={`${boxSize} bg-amber-50 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0`}>
        <Flame className={iconSize} />
      </div>
    );
  }
  if (text.includes('plan') || text.includes('annual') || text.includes('contract') || text.includes('عقد') || text.includes('صيانة سنوية')) {
    return (
      <div className={`${boxSize} bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0`}>
        <ShieldCheck className={iconSize} />
      </div>
    );
  }
  if (text.includes('emergency') || text.includes('24/7') || text.includes('urgent') || text.includes('طوارئ')) {
    return (
      <div className={`${boxSize} bg-rose-50 dark:bg-rose-500/10 border border-rose-200/60 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0`}>
        <Zap className={iconSize} />
      </div>
    );
  }
  if (text.includes('ac') || text.includes('cool') || text.includes('air') || text.includes('تكييف') || text.includes('مكيف')) {
    return (
      <div className={`${boxSize} bg-blue-50 dark:bg-blue-500/10 border border-blue-200/60 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0`}>
        <Snowflake className={iconSize} />
      </div>
    );
  }
  return (
    <div className={`${boxSize} bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0`}>
      <Wrench className={iconSize} />
    </div>
  );
}

const STATUS_TABS = [
  { key: 'all', label: 'All Bookings' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    bg: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 border-amber-200 dark:border-amber-500/30',
    dot: 'bg-amber-500',
  },
  confirmed: {
    label: 'Confirmed',
    bg: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400 border-blue-200 dark:border-blue-500/30',
    dot: 'bg-blue-500',
  },
  assigned: {
    label: 'Assigned',
    bg: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400 border-violet-200 dark:border-violet-500/30',
    dot: 'bg-violet-500',
  },
  in_progress: {
    label: 'In Progress',
    bg: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30',
    dot: 'bg-indigo-500',
  },
  completed: {
    label: 'Completed',
    bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  cancelled: {
    label: 'Cancelled',
    bg: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400 border-rose-200 dark:border-rose-500/30',
    dot: 'bg-rose-500',
  },
};

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTab, setCurrentTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [actionModal, setActionModal] = useState(null); // { booking, newStatus, label }

  const fetchBookings = useCallback(async () => {
    try {
      const res = await adminApi.getAllBookings('all', 1, 100);
      const data = res.bookings || res.data || [];
      setBookings(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading bookings:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchBookings();
  };

  const normalizeStatus = (st) => (st || 'pending').replace(/-/g, '_').toLowerCase();

  // Tab counts
  const counts = useMemo(() => {
    return bookings.reduce(
      (acc, b) => {
        acc.all = (acc.all || 0) + 1;
        const s = normalizeStatus(b.status);
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      },
      { all: 0, pending: 0, confirmed: 0, in_progress: 0, completed: 0, cancelled: 0 }
    );
  }, [bookings]);

  // Filtered list
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      const st = normalizeStatus(b.status);
      if (currentTab !== 'all' && st !== currentTab) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = (b.customerName || b.user?.name || b.user?.fullName || '').toLowerCase();
        const phone = (b.phone || b.user?.phone || '').toLowerCase();
        const srv = (b.service?.name || b.serviceDetails?.name || b.serviceName || '').toLowerCase();
        const id = (b.orderNumber || b.bookingId || b._id || '').toLowerCase();
        const addr = (b.address || '').toLowerCase();
        return name.includes(q) || phone.includes(q) || srv.includes(q) || id.includes(q) || addr.includes(q);
      }
      return true;
    });
  }, [bookings, currentTab, searchQuery]);

  const handleStatusChange = async (booking, newStatus, reason = '') => {
    setUpdatingId(booking._id);
    try {
      await adminApi.updateBookingStatus(booking._id, newStatus, reason);
      await fetchBookings();
      if (selectedBooking?._id === booking._id) {
        setSelectedBooking({ ...selectedBooking, status: newStatus });
      }
      setActionModal(null);
    } catch (err) {
      console.error('Error updating booking status:', err);
      alert('Failed to update status. Please check backend connection.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteBooking = async (booking, e) => {
    if (e) e.stopPropagation();
    const id = booking._id || booking.bookingId || booking.orderNumber;
    const name = booking.customerName || booking.user?.fullName || booking.user?.name || 'this booking';
    if (!window.confirm(`Are you sure you want to delete order for "${name}"?`)) {
      return;
    }
    setUpdatingId(booking._id);
    try {
      await adminApi.deleteBooking(booking._id || id);
      setBookings((prev) => prev.filter((b) => (b._id || b.bookingId || b.orderNumber) !== id));
      if (selectedBooking?._id === booking._id || selectedBooking?.bookingId === id) {
        setSelectedBooking(null);
      }
    } catch (err) {
      console.error('Error deleting booking:', err);
      alert('Failed to delete booking.');
    } finally {
      setUpdatingId(null);
    }
  };

  const openWhatsApp = (phone, customerName, serviceName) => {
    if (!phone) return;
    const clean = phone.replace(/[^\d+]/g, '').replace('+', '');
    const msg = `مرحباً ${customerName || 'عزيزي العميل'}، معك ورشة أحمد للتبريد بخصوص طلب خدمة (${serviceName || 'الصيانة'}). كيف يمكننا مساعدتك؟`;
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const getMapLink = (address, booking) => {
    if (booking?.latitude && booking?.longitude) {
      return `https://www.google.com/maps?q=${booking.latitude},${booking.longitude}`;
    }
    if (address) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address + ' Jeddah Saudi Arabia')}`;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-500">Loading Bookings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Bookings Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Review, dispatch, update and manage AC and home appliance repair appointments
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:text-blue-600 transition shadow-sm cursor-pointer disabled:opacity-50 self-start"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Search & Tabs */}
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer name, phone (+966), order ID (#AC-...), or address..."
            className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-sm transition"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {STATUS_TABS.map((tab) => {
            const count = counts[tab.key] || 0;
            const active = currentTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setCurrentTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bookings List / Table */}
      {filteredBookings.length === 0 ? (
        <div className="py-20 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-center p-8">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No Bookings Found</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            {searchQuery ? 'Try adjusting your search terms.' : 'No customer bookings currently match this filter.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden w-full">
          <div className="w-full overflow-hidden">
            <table className="w-full table-fixed text-left border-collapse">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[17%]" />
                <col className="w-[15%]" />
                <col className="w-[18%]" />
                <col className="w-[11%]" />
                <col className="w-[7%]" />
                <col className="w-[6%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 px-3 lg:px-3.5">Order ID & Service</th>
                  <th className="py-3.5 px-3 lg:px-3.5">Customer</th>
                  <th className="py-3.5 px-3 lg:px-3.5">Date & Time</th>
                  <th className="py-3.5 px-3 lg:px-3.5">Location</th>
                  <th className="py-3.5 px-3 lg:px-3.5">Status</th>
                  <th className="py-3.5 px-2 sm:px-3 text-right">Total</th>
                  <th className="py-3.5 px-1 sm:px-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {filteredBookings.map((bkg) => {
                  const status = STATUS_CONFIG[normalizeStatus(bkg.status)] || STATUS_CONFIG.pending;
                  const customerName = bkg.customerName || bkg.user?.name || bkg.user?.fullName || 'Guest Customer';
                  const serviceName = bkg.service?.name || bkg.serviceDetails?.name || bkg.serviceName || 'Appliance Maintenance';

                  return (
                    <tr
                      key={bkg._id}
                      onClick={() => setSelectedBooking(bkg)}
                      className="hover:bg-blue-50/40 dark:hover:bg-slate-800/40 transition cursor-pointer group"
                    >
                      {/* Order & Service */}
                      <td className="py-3 px-3 lg:px-3.5 min-w-0">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {renderServiceOutlineIcon(bkg.service, serviceName, 'sm')}
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-slate-900 dark:text-white truncate text-xs sm:text-sm">
                              {serviceName}
                            </p>
                            <span className="text-[10px] sm:text-[11px] font-mono text-slate-400 truncate block">
                              #{bkg.orderNumber || bkg.bookingId || bkg._id?.slice(-6).toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="py-3 px-3 lg:px-3.5 min-w-0">
                        <p className="font-semibold text-slate-800 dark:text-slate-200 truncate text-xs sm:text-sm">
                          {customerName}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono truncate">
                          {bkg.phone || 'No phone'}
                        </p>
                      </td>

                      {/* Date & Time */}
                      <td className="py-3 px-3 lg:px-3.5 min-w-0">
                        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium text-xs">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{bkg.date ? new Date(bkg.date).toLocaleDateString('en-GB') : 'Immediate'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{bkg.time || 'Flexible'}</span>
                        </div>
                      </td>

                      {/* Address */}
                      <td className="py-3 px-3 lg:px-3.5 min-w-0">
                        <p className="text-xs text-slate-600 dark:text-slate-300 truncate block" title={bkg.address}>
                          {bkg.address || 'Jeddah / Makkah'}
                        </p>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 lg:px-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${status.bg} whitespace-nowrap`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                          {status.label}
                        </span>
                      </td>

                      {/* Total */}
                      <td className="py-3 px-2 sm:px-3 text-right whitespace-nowrap text-xs sm:text-sm">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {bkg.totalAmount ?? 150}
                        </span>{' '}
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          SAR
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-1 sm:px-2 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          {bkg.phone && (
                            <button
                              onClick={() => openWhatsApp(bkg.phone, customerName, serviceName)}
                              className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition cursor-pointer"
                              title="Chat on WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedBooking(bkg)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 transition cursor-pointer"
                            title="View Full Details"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteBooking(bkg, e)}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition cursor-pointer"
                            title="Delete Booking"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Slide-over Detailed Drawer */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedBooking(null)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
              {/* Drawer Header */}
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      #{selectedBooking.orderNumber || selectedBooking._id?.slice(-6).toUpperCase()}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        STATUS_CONFIG[normalizeStatus(selectedBooking.status)]?.bg
                      }`}
                    >
                      {STATUS_CONFIG[normalizeStatus(selectedBooking.status)]?.label}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                    Booking Details
                  </h2>
                </div>
                <button
                  onClick={() => setSelectedBooking(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                {/* Service Card */}
                <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40">
                  <div className="flex items-center gap-3">
                    {renderServiceOutlineIcon(selectedBooking.service, selectedBooking.service?.name || selectedBooking.serviceName, 'lg')}
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white">
                        {selectedBooking.service?.name || selectedBooking.serviceName || 'Appliance Service'}
                      </h3>
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                        {selectedBooking.service?.category ? selectedBooking.service.category.toUpperCase() : 'AC & COOLING'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Customer Information */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Customer Details
                  </h4>
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center gap-2.5 text-sm">
                      <User className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {selectedBooking.customerName || selectedBooking.user?.fullName || selectedBooking.user?.name || 'Customer'}
                      </span>
                    </div>

                    {selectedBooking.phone && (
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2.5">
                          <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="font-mono text-slate-700 dark:text-slate-300">
                            {selectedBooking.phone}
                          </span>
                        </div>
                        <button
                          onClick={() =>
                            openWhatsApp(
                              selectedBooking.phone,
                              selectedBooking.customerName,
                              selectedBooking.service?.name
                            )
                          }
                          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </button>
                      </div>
                    )}

                    {selectedBooking.email && (
                      <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-400">
                        <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate">{selectedBooking.email}</span>
                      </div>
                    )}

                    {selectedBooking.address && (
                      <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                        <div className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                          <MapPin className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="font-medium leading-relaxed">{selectedBooking.address}</p>
                            {getMapLink(selectedBooking.address, selectedBooking) && (
                              <a
                                href={getMapLink(selectedBooking.address, selectedBooking)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline mt-1"
                              >
                                <span>Open in Google Maps</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Appointment Schedule */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Schedule & Time
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800">
                      <span className="text-[11px] font-semibold text-slate-400 block">Date</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 block">
                        {selectedBooking.date ? new Date(selectedBooking.date).toLocaleDateString('en-GB') : 'Immediate'}
                      </span>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800">
                      <span className="text-[11px] font-semibold text-slate-400 block">Time Slot</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 block">
                        {selectedBooking.time || 'Flexible'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Customer Notes */}
                {(selectedBooking.notes || selectedBooking.comments || selectedBooking.problemDescription) && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Issue Description / Notes
                    </h4>
                    <div className="p-3.5 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 text-xs font-medium text-amber-900 dark:text-amber-200 leading-relaxed">
                      {selectedBooking.notes || selectedBooking.comments || selectedBooking.problemDescription}
                    </div>
                  </div>
                )}

                {/* Financial Breakdown */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Pricing Summary
                  </h4>
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 space-y-2 text-sm">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Service Diagnostic / Repair</span>
                      <span>
                        {selectedBooking.servicePrice ?? selectedBooking.serviceCharge ?? (selectedBooking.totalAmount ? selectedBooking.totalAmount - (selectedBooking.visitCharges ?? selectedBooking.visitFee ?? 50) : 150)} SAR
                      </span>
                    </div>
                    {((selectedBooking.visitCharges !== undefined && selectedBooking.visitCharges > 0) || (selectedBooking.visitFee !== undefined && selectedBooking.visitFee > 0)) && (
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>Technician Visit Fee</span>
                        <span>{selectedBooking.visitCharges ?? selectedBooking.visitFee ?? 50} SAR</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between font-bold text-slate-900 dark:text-white text-base">
                      <span>Total Amount</span>
                      <span className="text-blue-600 dark:text-blue-400 font-bold">
                        {selectedBooking.totalAmount ?? 200} SAR
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Action Buttons Footer */}
              <div className="p-6 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Update Booking Status
                </h4>

                <div className="grid grid-cols-2 gap-2">
                  {selectedBooking.status !== 'confirmed' && selectedBooking.status !== 'completed' && (
                    <button
                      onClick={() => handleStatusChange(selectedBooking, 'confirmed')}
                      disabled={updatingId === selectedBooking._id}
                      className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>Confirm</span>
                    </button>
                  )}

                  {selectedBooking.status !== 'in_progress' && selectedBooking.status !== 'completed' && (
                    <button
                      onClick={() => handleStatusChange(selectedBooking, 'in_progress')}
                      disabled={updatingId === selectedBooking._id}
                      className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Wrench className="w-4 h-4" />
                      <span>In Progress</span>
                    </button>
                  )}

                  {selectedBooking.status !== 'completed' && (
                    <button
                      onClick={() => handleStatusChange(selectedBooking, 'completed')}
                      disabled={updatingId === selectedBooking._id}
                      className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Mark Complete</span>
                    </button>
                  )}

                  {selectedBooking.status !== 'cancelled' && (
                    <button
                      onClick={() => handleStatusChange(selectedBooking, 'cancelled', 'Cancelled by Admin')}
                      disabled={updatingId === selectedBooking._id}
                      className="py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Ban className="w-4 h-4" />
                      <span>Cancel</span>
                    </button>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => handleDeleteBooking(selectedBooking)}
                    disabled={updatingId === selectedBooking._id}
                    className="w-full py-2.5 px-3 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Booking Record</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
