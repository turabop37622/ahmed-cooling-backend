'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2, Calendar, Clock, MapPin, ChevronRight, ChevronLeft,
  X, Star, AlertCircle, CheckCircle2, Package, Inbox, Filter,
  Send, RotateCcw, Ban,
} from 'lucide-react';
import { useTranslation } from '@/contexts/TranslationContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  getUserBookings, getBookingsByPhone, cancelBooking,
  publicCancelBooking, rescheduleBooking, submitReview,
} from '@/lib/api';

const STATUS_CONFIG = {
  pending:     { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', dot: 'bg-amber-500' },
  confirmed:   { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', dot: 'bg-blue-500' },
  assigned:    { color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', dot: 'bg-violet-500' },
  'on-the-way':{ color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400', dot: 'bg-cyan-500' },
  'in-progress':{ color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400', dot: 'bg-indigo-500' },
  completed:   { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-500' },
  cancelled:   { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', dot: 'bg-red-500' },
};

const FILTERS = ['all', 'pending', 'confirmed', 'completed'];

const RESCHEDULE_TIMES = [
  '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM',
  '05:00 PM', '06:00 PM',
];

function statusLabel(status, t) {
  const key = `status${status?.charAt(0).toUpperCase()}${status?.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`;
  return t[key] || status || 'Unknown';
}

export default function BookingsPage() {
  const router = useRouter();
  const { t, language, isRTL, toAr, formatPrice } = useTranslation();
  const { user, token, loading: authLoading } = useAuth();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');

  const [detailBooking, setDetailBooking] = useState(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [reviewBooking, setReviewBooking] = useState(null);
  const [reviewStars, setReviewStars] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace('/login');
    }
  }, [authLoading, token, router]);

  useEffect(() => {
    if (token) loadBookings();
  }, [token]);

  const loadBookings = async () => {
    setLoading(true);
    try {
      const results = [];
      try {
        const res = await getUserBookings();
        const list = res?.bookings ?? res?.data ?? res;
        if (Array.isArray(list)) results.push(...list);
      } catch {}
      if (user?.phone) {
        try {
          const res2 = await getBookingsByPhone(user.phone);
          const list2 = res2?.bookings ?? res2?.data ?? res2;
          if (Array.isArray(list2)) {
            list2.forEach((b) => {
              if (!results.find((r) => (r._id || r.id) === (b._id || b.id))) results.push(b);
            });
          }
        } catch {}
      }
      results.sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
      setBookings(results);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const nonCancelled = bookings.filter((b) => b.status?.toLowerCase() !== 'cancelled');
    if (activeFilter === 'all') return nonCancelled;
    return nonCancelled.filter((b) => b.status?.toLowerCase() === activeFilter);
  }, [bookings, activeFilter]);

  const handleCancel = async (booking) => {
    if (!confirm(t.cancelBookingConfirm || 'Are you sure you want to cancel?')) return;
    setCancelling(true);
    try {
      const id = booking._id || booking.id;
      if (token && user) {
        await cancelBooking(id, 'Customer requested cancellation');
      } else {
        await publicCancelBooking(id, 'Customer requested cancellation', booking.phone);
      }
      alert(t.bookingCancelled || 'Booking cancelled');
      setDetailBooking(null);
      loadBookings();
    } catch {
      alert(t.failedToCancel || 'Failed to cancel');
    } finally {
      setCancelling(false);
    }
  };

  const handleReschedule = async (booking) => {
    if (!rescheduleDate || !rescheduleTime) {
      alert(t.rescheduleRequired || 'Please select both date and time.');
      return;
    }
    setRescheduling(true);
    try {
      const id = booking._id || booking.id;
      await rescheduleBooking(id, { date: rescheduleDate, time: rescheduleTime, phone: booking.phone });
      alert(t.rescheduleSuccess || 'Booking rescheduled!');
      setShowReschedule(false);
      setDetailBooking(null);
      loadBookings();
    } catch {
      alert(t.rescheduleFailed || 'Failed to reschedule.');
    } finally {
      setRescheduling(false);
    }
  };

  const handleReviewSubmit = async () => {
    if (!reviewStars) {
      alert(t.reviewAlertRatingMsg || 'Please select a star rating');
      return;
    }
    setSubmittingReview(true);
    try {
      const id = reviewBooking._id || reviewBooking.id;
      await submitReview(id, {
        rating: reviewStars,
        comment: reviewText.trim(),
        name: user?.name || reviewBooking.customerName || 'Customer',
        phone: user?.phone || reviewBooking.phone || '',
      });
      alert(t.reviewAlertThanksMsg || 'Your review has been submitted.');
      setReviewBooking(null);
      setReviewStars(0);
      setReviewText('');
      loadBookings();
    } catch {
      alert(t.reviewErrorSubmit || 'Failed to submit review');
    } finally {
      setSubmittingReview(false);
    }
  };

  const filterLabels = {
    all: t.filterAll || 'All',
    pending: t.filterPending || 'Pending',
    confirmed: t.filterConfirmed || 'Confirmed',
    completed: t.filterCompleted || 'Completed',
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-bg dark:bg-slate-950">
        <Loader2 className="h-10 w-10 animate-spin text-primary dark:text-blue-400" />
        <p className="text-sm font-semibold text-sub dark:text-slate-400">{t.loading}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg pb-10 dark:bg-slate-950" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-6 flex items-end gap-3">
          <div className="h-8 w-1 shrink-0 rounded-full bg-primary dark:bg-blue-500" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black tracking-tight text-text dark:text-white">{t.myBookings || 'My Bookings'}</h1>
            <p className="mt-0.5 text-xs font-semibold text-sub dark:text-slate-400">
              {language === 'ar' ? toAr(bookings.length) : bookings.length} {bookings.length === 1 ? (t.bookingCount || 'booking') : (t.bookingCountPlural || 'bookings')}
            </p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
          {FILTERS.map((f) => {
            const active = activeFilter === f;
            const count = f === 'all' ? bookings.length : bookings.filter((b) => b.status?.toLowerCase() === f).length;
            return (
              <button key={f} onClick={() => setActiveFilter(f)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-extrabold transition ${
                  active
                    ? 'border-primary bg-primary text-white dark:border-blue-500 dark:bg-blue-600'
                    : 'border-border bg-white text-text hover:border-primary/40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {filterLabels[f]}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${active ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'}`}>{language === 'ar' ? toAr(count) : count}</span>
              </button>
            );
          })}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary dark:text-blue-400" />
            <p className="text-sm font-semibold text-sub dark:text-slate-400">{t.loading}</p>
          </div>
        )}

        {/* Bookings List */}
        {!loading && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((booking) => {
              const id = booking._id || booking.id;
              const status = (booking.status || 'pending').toLowerCase();
              const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
              return (
                <div key={id} className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
                  <div className="p-4">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-lg dark:bg-blue-950/40">
                          {booking.serviceIcon || booking.icon || '🔧'}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-text dark:text-white">
                            {booking.serviceName || booking.service?.name || (t.acService || 'Service')}
                          </p>
                          <p className="text-[11px] font-semibold text-sub dark:text-slate-500">
                            {t.orderLabel || 'Order:'} #{language === 'ar' ? toAr((id || '').slice(-6).toUpperCase()) : (id || '').slice(-6).toUpperCase()}
                          </p>
                        </div>
                      </div>
                      <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black ${cfg.color}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                        {statusLabel(status, t)}
                      </span>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-3 text-xs text-sub dark:text-slate-400">
                      <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{booking.date || '—'}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{booking.time || '—'}</span>
                      {booking.totalAmount != null && (
                        <span className="font-bold text-primary dark:text-blue-400">{formatPrice(booking.totalAmount)}</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setDetailBooking(booking); setShowReschedule(false); }}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary-light py-2 text-xs font-bold text-primary transition hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-950/30 dark:text-blue-400"
                      >
                        {t.viewDetails || 'View Details'}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      {status === 'completed' && !booking.reviewed && (
                        <button onClick={() => { setReviewBooking(booking); setReviewStars(0); setReviewText(''); }}
                          className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-4 py-2 text-xs font-bold text-amber-600 transition hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-400"
                        >
                          <Star className="h-3.5 w-3.5" />{t.review || 'Review'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!loading && filtered.length === 0 && (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-white/50 px-6 py-14 dark:border-slate-700 dark:bg-slate-900/40">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
              <Inbox className="h-8 w-8 text-sub dark:text-slate-500" />
            </div>
            <p className="text-center text-sm font-extrabold text-text dark:text-white">
              {activeFilter === 'all'
                ? (t.noBookingsYet || 'No Bookings Yet')
                : (t.noBookingsFiltered || 'No bookings found').replace('{filter}', filterLabels[activeFilter])}
            </p>
            <p className="text-center text-xs text-sub dark:text-slate-500">
              {activeFilter === 'all' ? (t.bookServiceToStart || 'Book a service to get started!') : (t.tryDifferentFilter || 'Try a different filter')}
            </p>
            {activeFilter === 'all' && (
              <Link href="/services"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-xs font-black text-white transition hover:bg-primary-dark dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                <Package className="h-4 w-4" />
                {t.browseServices || 'Browse Services'}
              </Link>
            )}
          </div>
        )}
      </div>

      {/* ======= DETAIL MODAL ======= */}
      {detailBooking && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setDetailBooking(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl dark:bg-slate-900"
          >
            {(() => {
              const b = detailBooking;
              const status = (b.status || 'pending').toLowerCase();
              const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
              const bid = b._id || b.id;
              return (
                <>
                  {/* Header */}
                  <div className="mb-5 flex items-center justify-between">
                    <h2 className="text-lg font-black text-text dark:text-white">{t.bookingDetails || 'Booking Details'}</h2>
                    <button onClick={() => setDetailBooking(null)} className="rounded-lg p-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800">
                      <X className="h-5 w-5 text-sub dark:text-slate-400" />
                    </button>
                  </div>

                  {/* Status Banner */}
                  <div className={`mb-5 flex items-center gap-2 rounded-xl px-4 py-3 ${cfg.color}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
                    <span className="text-sm font-black">{statusLabel(status, t)}</span>
                  </div>

                  {/* Service Info */}
                  <SectionLabel text={t.sectionService || 'SERVICE'} />
                  <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-lg dark:bg-blue-950/50">
                      {b.serviceIcon || b.icon || '🔧'}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text dark:text-white">{b.serviceName || b.service?.name || 'Service'}</p>
                      <p className="text-xs text-sub dark:text-slate-500">#{language === 'ar' ? toAr((bid || '').slice(-6).toUpperCase()) : (bid || '').slice(-6).toUpperCase()}</p>
                    </div>
                  </div>

                  {/* Schedule & Location */}
                  <SectionLabel text={t.sectionSchedule || 'SCHEDULE & LOCATION'} />
                  <div className="mb-4 space-y-2 rounded-xl border border-border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <div className="flex items-center gap-2 text-sm text-text dark:text-slate-300">
                      <Calendar className="h-4 w-4 text-primary dark:text-blue-400" />
                      <span className="font-semibold">{b.date || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-text dark:text-slate-300">
                      <Clock className="h-4 w-4 text-primary dark:text-blue-400" />
                      <span className="font-semibold">{b.time || '—'}</span>
                    </div>
                    {b.address && (
                      <div className="flex items-start gap-2 text-sm text-text dark:text-slate-300">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary dark:text-blue-400" />
                        <span className="font-semibold">{b.address}</span>
                      </div>
                    )}
                  </div>

                  {/* Payment */}
                  <SectionLabel text={t.sectionPayment || 'PAYMENT'} />
                  <div className="mb-5 space-y-2 rounded-xl border border-border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <div className="flex justify-between text-sm">
                      <span className="text-sub dark:text-slate-400">{t.serviceCharge || 'Service Charge'}</span>
                      <span className="font-bold text-text dark:text-white">{formatPrice((b.totalAmount || 0) - 200)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-sub dark:text-slate-400">{t.visitFee || 'Visit Fee'}</span>
                      <span className="font-bold text-text dark:text-white">{formatPrice(200)}</span>
                    </div>
                    <div className="border-t border-dashed border-border pt-2 dark:border-slate-600">
                      <div className="flex justify-between">
                        <span className="text-sm font-black text-text dark:text-white">{t.total || 'Total'}</span>
                        <span className="text-lg font-black text-primary dark:text-blue-400">{formatPrice(b.totalAmount || 0)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Reschedule inline */}
                  {showReschedule && (status === 'confirmed' || status === 'pending') && (
                    <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
                      <p className="mb-3 text-sm font-black text-text dark:text-white">{t.rescheduleTitle || 'Reschedule Booking'}</p>
                      <div className="mb-3">
                        <label className="mb-1 block text-xs font-bold text-sub dark:text-slate-400">{t.selectDate || 'Select Date'}</label>
                        <input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-text dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                      <div className="mb-3">
                        <label className="mb-1 block text-xs font-bold text-sub dark:text-slate-400">{t.selectTimeLabel || 'Select Time'}</label>
                        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                          {RESCHEDULE_TIMES.map((tm) => (
                            <button key={tm} onClick={() => setRescheduleTime(tm)}
                              className={`rounded-lg border px-2 py-1.5 text-xs font-bold transition ${rescheduleTime === tm ? 'border-primary bg-primary text-white' : 'border-border bg-white text-text dark:border-slate-600 dark:bg-slate-800 dark:text-white'}`}
                            >{tm}</button>
                          ))}
                        </div>
                      </div>
                      <button onClick={() => handleReschedule(b)} disabled={rescheduling}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-black text-white transition hover:bg-primary-dark disabled:opacity-60 dark:bg-blue-600"
                      >
                        {rescheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        {t.confirmReschedule || 'Confirm Reschedule'}
                      </button>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {(status === 'pending' || status === 'confirmed') && (
                      <button onClick={() => handleCancel(b)} disabled={cancelling}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-red-200 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/50 dark:text-red-400"
                      >
                        {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                        {t.cancelBooking || 'Cancel'}
                      </button>
                    )}
                    {status === 'confirmed' && !showReschedule && (
                      <button onClick={() => { setShowReschedule(true); setRescheduleDate(''); setRescheduleTime(''); }}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition hover:bg-primary-dark dark:bg-blue-600"
                      >
                        <RotateCcw className="h-4 w-4" />
                        {t.rescheduleBooking || 'Reschedule'}
                      </button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ======= REVIEW MODAL ======= */}
      {reviewBooking && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setReviewBooking(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl dark:bg-slate-900"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-text dark:text-white">{t.leaveReview || 'Leave a Review'}</h2>
              <button onClick={() => setReviewBooking(null)} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-5 w-5 text-sub" />
              </button>
            </div>

            <p className="mb-1 text-center text-sm font-semibold text-sub dark:text-slate-400">{t.howWasService || 'How was the service?'}</p>
            <div className="mb-1 flex items-center justify-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setReviewStars(s)} className="p-1">
                  <Star className={`h-8 w-8 transition ${s <= reviewStars ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}`} />
                </button>
              ))}
            </div>
            <p className="mb-4 text-center text-xs font-bold text-sub dark:text-slate-500">
              {reviewStars === 0 ? (t.tapToRate || 'Tap to rate') :
               reviewStars === 1 ? (t.ratingPoor || 'Poor') :
               reviewStars === 2 ? (t.ratingFair || 'Fair') :
               reviewStars === 3 ? (t.ratingGood || 'Good') :
               reviewStars === 4 ? (t.ratingVeryGood || 'Very Good') :
               (t.ratingExcellent || 'Excellent')}
            </p>

            <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} rows={3}
              placeholder={t.shareExperience || 'Share your experience...'}
              className="mb-4 w-full resize-none rounded-xl border border-border bg-white px-4 py-3 text-sm font-semibold text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />

            <button onClick={handleReviewSubmit} disabled={submittingReview}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-black text-white transition hover:bg-primary-dark disabled:opacity-60 dark:bg-blue-600"
            >
              {submittingReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {t.submitReview || 'Submit Review'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ text }) {
  return <p className="mb-2 text-[11px] font-black tracking-wider text-sub uppercase dark:text-slate-500">{text}</p>;
}
