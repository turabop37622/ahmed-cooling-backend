'use client';

import { useState, useMemo } from 'react';
import { Star, PartyPopper, Loader2, AlertCircle, CheckCircle2, User, Phone } from 'lucide-react';
import { useTranslation } from '@/contexts/TranslationContext';
import { useAuth } from '@/contexts/AuthContext';
import { submitGeneralRating } from '@/lib/api';

const MAX_FEEDBACK = 500;

export default function RatePage() {
  const { t, isRTL, language } = useTranslation();
  const { user } = useAuth();

  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [authorName, setAuthorName] = useState(user?.fullName || user?.name || '');
  const [authorPhone, setAuthorPhone] = useState(user?.phone || '');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const labels = useMemo(
    () => [t.ratingPoor, t.ratingFair, t.ratingGood, t.ratingGreat, t.ratingExcellent],
    [t.ratingPoor, t.ratingFair, t.ratingGood, t.ratingGreat, t.ratingExcellent],
  );

  const activeRating = hover || rating;
  const labelText = activeRating >= 1 && activeRating <= 5 ? labels[activeRating - 1] : '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating < 1) {
      setError(language === 'ar' ? 'يرجى تحديد التقييم بالنجوم أولاً' : 'Please select a star rating first');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await submitGeneralRating({
        rating,
        feedback: feedback.trim(),
        name: authorName.trim() || user?.fullName || 'Customer',
        phone: authorPhone.trim() || user?.phone || '',
      });

      if (res?.success) {
        setSubmitted(true);
      } else {
        setError(res?.message || 'Failed to submit rating. Please try again.');
      }
    } catch (err) {
      console.error('Rate submission error:', err);
      // Even if network fails, don't block user experience
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-[60vh] bg-bg pb-16 dark:bg-slate-950"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="w-full px-4 py-10 sm:px-8 lg:px-16 xl:px-24">
        <div className="mx-auto max-w-lg scroll-reveal">
          <div className="mb-2 flex items-center gap-3">
            <span className="h-8 w-1 shrink-0 rounded-full bg-primary dark:bg-blue-500" />
            <h1 className="text-2xl font-black text-text dark:text-white sm:text-3xl">{t.rateUsTitle}</h1>
          </div>
          <p className="text-sm font-semibold text-primary dark:text-blue-400">{t.appName}</p>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
              {error && (
                <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Star Rating Card */}
              <div className="scroll-reveal-scale rounded-2xl border border-border bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-8">
                <h2 className="text-center text-lg font-extrabold text-text dark:text-white">
                  {t.howWasExperience}
                </h2>
                <div
                  className="mt-6 flex justify-center gap-2 sm:gap-3"
                  role="group"
                  aria-label={t.howWasExperience}
                >
                  {[1, 2, 3, 4, 5].map((n) => {
                    const filled = n <= activeRating;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => { setRating(n); setError(''); }}
                        onMouseEnter={() => setHover(n)}
                        onMouseLeave={() => setHover(0)}
                        className="rounded-lg p-1 transition-transform hover:scale-110 focus:outline-none cursor-pointer"
                        aria-label={`${n} ${n === 1 ? t.star : t.stars}`}
                      >
                        <Star
                          className={`h-10 w-10 sm:h-12 sm:w-12 ${
                            filled
                              ? 'fill-amber-400 text-amber-400'
                              : 'fill-transparent text-slate-300 dark:text-slate-600'
                          }`}
                          strokeWidth={filled ? 0 : 1.5}
                        />
                      </button>
                    );
                  })}
                </div>
                <p
                  className="mt-4 min-h-[1.5rem] text-center text-sm font-bold text-primary dark:text-blue-400"
                  aria-live="polite"
                >
                  {labelText || '\u00a0'}
                </p>
              </div>

              {/* Optional Name & Phone */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-sub dark:text-slate-400 mb-1.5">
                    {language === 'ar' ? 'الاسم (اختياري)' : 'Name (Optional)'}
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={authorName}
                      onChange={(e) => setAuthorName(e.target.value)}
                      placeholder={language === 'ar' ? 'اسمك الكريم' : 'Your Name'}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-white text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-sub dark:text-slate-400 mb-1.5">
                    {language === 'ar' ? 'رقم الهاتف (اختياري)' : 'Phone (Optional)'}
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="tel"
                      value={authorPhone}
                      onChange={(e) => setAuthorPhone(e.target.value)}
                      placeholder="+966 5XX XXX XXX"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-white text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Message */}
              <div>
                <label htmlFor="rate-feedback" className="block text-sm font-extrabold text-text dark:text-white">
                  {t.yourMessage}
                </label>
                <textarea
                  id="rate-feedback"
                  value={feedback}
                  onChange={(e) => { if (e.target.value.length <= MAX_FEEDBACK) setFeedback(e.target.value); }}
                  maxLength={MAX_FEEDBACK}
                  rows={4}
                  placeholder={t.tellUsWhat}
                  className="mt-2 w-full resize-y rounded-xl border border-border bg-white px-4 py-3 text-sm text-text placeholder:text-sub focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
                />
                <p className="mt-2 text-end text-xs font-semibold text-sub dark:text-slate-500">
                  {feedback.length} / {MAX_FEEDBACK} {t.characters}
                </p>
              </div>

              <button
                type="submit"
                disabled={rating < 1 || submitting}
                className="w-full rounded-xl bg-primary py-3.5 text-sm font-black text-white shadow-lg shadow-primary/25 transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700 cursor-pointer flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                {submitting ? (language === 'ar' ? 'جاري الإرسال...' : 'Submitting...') : t.submitRating}
              </button>
            </form>
          ) : (
            <div
              className="mt-10 rounded-2xl border border-border bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-10"
              role="status"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-light dark:bg-blue-950/80">
                <PartyPopper className="h-8 w-8 text-primary dark:text-blue-400" aria-hidden />
              </div>
              <h2 className="text-xl font-black text-text dark:text-white">{t.thankYou}</h2>
              <p className="mt-3 text-sm leading-relaxed text-sub dark:text-slate-300">{t.rateThankYouMsg}</p>
              {rating > 0 && (
                <p className="mt-4 text-sm font-bold text-primary dark:text-blue-400">
                  {labels[rating - 1]} · {rating}/5
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
