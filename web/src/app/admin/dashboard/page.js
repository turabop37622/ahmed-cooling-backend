'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminApi } from '../adminApi';
import {
  TrendingUp,
  ClipboardList,
  Clock,
  CheckCircle2,
  Users,
  RefreshCw,
  ArrowRight,
  Wrench,
  AlertCircle,
  Phone,
  MessageCircle,
  Calendar,
  Sparkles,
  Plus,
  Star,
  Snowflake,
  Refrigerator,
  WashingMachine,
  Flame,
  Wind,
  Zap,
  ShieldCheck,
} from 'lucide-react';

function renderServiceOutlineIcon(service, serviceName) {
  const text = ((service?.name || '') + ' ' + (serviceName || '') + ' ' + (service?.category || '')).toLowerCase();
  const iconSize = 'w-5 h-5 stroke-[1.8]';
  const boxSize = 'w-10 h-10 rounded-2xl';

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

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [recentBookings, setRecentBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, bookingsRes] = await Promise.all([
        adminApi.getStats(),
        adminApi.getAllBookings('all', 1, 6),
      ]);
      setStats(statsRes.stats || statsRes);
      const bks = bookingsRes.bookings || bookingsRes.data || [];
      setRecentBookings(Array.isArray(bks) ? bks.slice(0, 6) : []);
    } catch (err) {
      console.error('Error fetching admin dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleQuickConfirm = async (id, e) => {
    e.stopPropagation();
    try {
      await adminApi.confirmBooking(id);
      fetchData();
    } catch (err) {
      console.error('Confirm error:', err);
    }
  };

  const openWhatsApp = (phone, customerName, serviceName, e) => {
    e.stopPropagation();
    if (!phone) return;
    const cleanPhone = phone.replace(/[^\d+]/g, '').replace('+', '');
    const msg = `مرحباً ${customerName || 'عزيزي العميل'}، معك ورشة أحمد للتبريد بخصوص حجز خدمة (${serviceName || 'الصيانة'}). كيف يمكننا مساعدتك؟`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-500">Loading Dashboard...</p>
      </div>
    );
  }

  const kpiCards = [
    {
      title: 'Total Revenue',
      value: `${(stats?.revenue ?? 0).toLocaleString()} SAR`,
      subtext: 'Completed service volume',
      icon: TrendingUp,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-200/80 dark:border-emerald-500/20',
    },
    {
      title: 'Total Bookings',
      value: stats?.totalBookings ?? 0,
      subtext: 'Lifetime orders placed',
      icon: ClipboardList,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-200/80 dark:border-blue-500/20',
    },
    {
      title: 'Pending Action',
      value: stats?.pending ?? 0,
      subtext: 'Awaiting review / confirmation',
      icon: Clock,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-200/80 dark:border-amber-500/20',
      badge: stats?.pending > 0 ? 'Urgent' : null,
    },
    {
      title: 'Confirmed & Active',
      value: (stats?.confirmed ?? 0) + (stats?.inProgress ?? 0),
      subtext: 'Scheduled or being serviced',
      icon: CheckCircle2,
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-500/10',
      border: 'border-indigo-200/80 dark:border-indigo-500/20',
    },
    {
      title: 'Active Services',
      value: stats?.totalServices ?? 12,
      subtext: 'Available for booking online',
      icon: Wrench,
      color: 'text-cyan-600 dark:text-cyan-400',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-200/80 dark:border-cyan-500/20',
    },
    {
      title: 'Registered Users',
      value: stats?.totalUsers ?? 0,
      subtext: 'Customer accounts in DB',
      icon: Users,
      color: 'text-violet-600 dark:text-violet-400',
      bg: 'bg-violet-500/10',
      border: 'border-violet-200/80 dark:border-violet-500/20',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Workshop Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time analytics and management for Jeddah & Makkah cooling services
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:text-blue-600 transition shadow-sm cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <Link
            href="/admin/services"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md shadow-blue-600/25 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Service</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {kpiCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={i}
              className={`p-6 rounded-3xl bg-white dark:bg-slate-900 border ${card.border} shadow-sm hover:shadow-md transition-shadow relative overflow-hidden`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {card.title}
                  </p>
                  <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">
                    {card.value}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{card.subtext}</p>
                </div>
                <div className={`p-3 rounded-2xl ${card.bg} shrink-0`}>
                  <Icon className={`w-6 h-6 ${card.color}`} />
                </div>
              </div>

              {card.badge && (
                <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white uppercase tracking-wider animate-pulse">
                  {card.badge}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Manage Bookings', href: '/admin/bookings', count: stats?.totalBookings, color: 'text-blue-600', icon: ClipboardList },
          { label: 'Workshop Services', href: '/admin/services', count: stats?.totalServices, color: 'text-cyan-600', icon: Wrench },
          { label: 'Customer Directory', href: '/admin/users', count: stats?.totalUsers, color: 'text-violet-600', icon: Users },
          { label: 'Reviews & Ratings', href: '/admin/reviews', count: '4.9 ★', color: 'text-amber-500', icon: Star },
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <Link
              key={idx}
              href={item.href}
              className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500/50 transition-all hover:shadow-md group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={`w-5 h-5 ${item.color}`} />
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{item.label}</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{item.count}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Recent Bookings Section */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Recent Customer Requests</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Latest service bookings from Jeddah and Makkah</p>
          </div>
          <Link
            href="/admin/bookings"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
          >
            <span>View All Bookings</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentBookings.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <ClipboardList className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No bookings logged yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {recentBookings.map((bkg) => {
              const status = STATUS_CONFIG[bkg.status] || STATUS_CONFIG.pending;
              const serviceName = bkg.service?.name || bkg.serviceName || 'AC Maintenance';
              const customerName = bkg.customerName || bkg.user?.name || bkg.user?.fullName || 'Customer';

              return (
                <div
                  key={bkg._id}
                  onClick={() => router.push('/admin/bookings')}
                  className="p-4 sm:p-6 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    {renderServiceOutlineIcon(bkg.service, serviceName)}

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                          {serviceName}
                        </span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500">
                          #{bkg.orderNumber || bkg._id?.slice(-5).toUpperCase()}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1 flex-wrap">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{customerName}</span>
                        {bkg.phone && (
                          <span className="flex items-center gap-1 font-mono">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {bkg.phone}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {bkg.date ? new Date(bkg.date).toLocaleDateString('en-GB') : 'Today'}
                        </span>
                      </div>

                      {bkg.address && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 truncate max-w-xl">
                          📍 {bkg.address}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                    <div className="text-right">
                      <span className="block text-sm font-black text-slate-900 dark:text-white">
                        {bkg.totalAmount ?? 150} SAR
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${status.bg}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                    </div>

                    {/* Quick WhatsApp Button */}
                    {bkg.phone && (
                      <button
                        onClick={(e) => openWhatsApp(bkg.phone, customerName, serviceName, e)}
                        className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition"
                        title="Chat on WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    )}

                    {/* Quick Confirm button if pending */}
                    {bkg.status === 'pending' && (
                      <button
                        onClick={(e) => handleQuickConfirm(bkg._id, e)}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition"
                      >
                        Confirm
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
