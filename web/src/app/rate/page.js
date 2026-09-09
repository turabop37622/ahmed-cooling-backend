'use client';

import { useState, useMemo, useCallback } from 'react';
import { Star, PartyPopper } from 'lucide-react';
import { useTranslation } from '@/contexts/TranslationContext';

const MAX_FEEDBACK = 500;

export default function RatePage() {
  const { t, isRTL } = useTranslation();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const labels = useMemo(
    () => [t.ratingPoor, t.ratingFair, t.ratingGood, t.ratingGreat, t.ratingExcellent],
    [t.ratingPoor, t.ratingFair, t.ratingGood, t.ratingGreat, t.ratingExcellent],
  );

  const activeRating = hover || rating;
  const labelText = activeRating >= 1 && activeRating <= 5 ? labels[activeRating - 1] : '';

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (rating < 1) return;
      setSubmitted(true);
    },
    [rating],
  );

  const onFeedbackChange = useCallback((e) => {
    const v = e.target.value;
    if (v.length <= MAX_FEEDBACK) setFeedback(v);
  }, []);

  return (
    <div
      className="min-h-[60vh] bg-bg pb-16 dark:bg-slate-950"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="w-full px-4 py-10 sm:px-8 lg:px-16 xl:px-24">
        <div className="mx-auto max-w-lg">
        <div className="mb-2 flex items-center gap-3">
          <span className="h-8 w-1 shrink-0 rounded-full bg-primary dark:bg-blue-500" />
          <h1 className="text-2xl font-black text-text dark:text-white sm:text-3xl">{t.rateUsTitle}</h1>
        </div>
        <p className="text-sm font-semibold text-primary dark:text-blue-400">{t.appName}</p>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="mt-10 space-y-8">
            <div className="rounded-2xl border border-border bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-8">
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
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHover(n)}
                      onMouseLeave={() => setHover(0)}
                      className="rounded-lg p-1 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:focus-visible:ring-blue-500"
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

            <div>
              <label htmlFor="rate-feedback" className="block text-sm font-extrabold text-text dark:text-white">
                {t.yourMessage}
              </label>
              <textarea
                id="rate-feedback"
                value={feedback}
                onChange={onFeedbackChange}
                maxLength={MAX_FEEDBACK}
                rows={5}
                placeholder={t.tellUsWhat}
                className="mt-2 w-full resize-y rounded-xl border border-border bg-white px-4 py-3 text-sm text-text placeholder:text-sub focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
              />
              <p className="mt-2 text-end text-xs font-semibold text-sub dark:text-slate-500">
                {feedback.length} / {MAX_FEEDBACK} {t.characters}
              </p>
            </div>

            <button
              type="submit"
              disabled={rating < 1}
              className="w-full rounded-xl bg-primary py-3.5 text-sm font-black text-white shadow-lg shadow-primary/25 transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700 dark:shadow-blue-900/30"
            >
              {t.submitRating}
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
