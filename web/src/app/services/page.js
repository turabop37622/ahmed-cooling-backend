'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Inbox, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/contexts/TranslationContext';
import { getServices } from '@/lib/api';
import ServiceCard from '@/components/ServiceCard';

const FILTERS = [
  { id: 'all', labelKey: 'catAll' },
  { id: 'ac', labelKey: 'catAC' },
  { id: 'refrigerator', labelKey: 'catFridge' },
  { id: 'washing-machine', labelKey: 'catWasher' },
  { id: 'stove', labelKey: 'catStove' },
  { id: 'general', labelKey: 'catGeneral' },
  { id: 'popular', labelKey: 'popular' },
  { id: 'emergency', labelKey: 'emergency' },
];

function normalizeCategory(raw) {
  if (raw == null) return '';
  const s = String(raw).toLowerCase().trim();
  if (s === 'fridge') return 'refrigerator';
  if (s === 'washer' || s === 'washing machine' || s === 'washing_machine') {
    return 'washing-machine';
  }
  return s;
}

function serviceMatchesFilter(service, filterId) {
  if (filterId === 'all') return true;
  if (filterId === 'popular') return !!(service.isPopular || service.popular);
  if (filterId === 'emergency') return !!(service.isEmergency || service.emergency);
  return normalizeCategory(service.category) === filterId;
}

export default function ServicesPage() {
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const [allServices, setAllServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getServices();
      const list = res?.services ?? res?.data ?? res;
      setAllServices(Array.isArray(list) ? list : []);
    } catch {
      setAllServices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  const filteredServices = useMemo(
    () => allServices.filter((s) => serviceMatchesFilter(s, activeFilter)),
    [allServices, activeFilter],
  );

  const serviceCountLabel = useMemo(() => {
    const n = filteredServices.length;
    if (n === 1) return `1 ${t.service}`;
    return `${n} ${t.services}`;
  }, [filteredServices.length, t.service, t.services]);

  const handleBook = useCallback(
    (service) => {
      const id = service._id || service.id;
      if (id) router.push(`/book/${id}`);
    },
    [router],
  );

  const resetFilter = () => setActiveFilter('all');

  return (
    <div className="min-h-[60vh] bg-bg pb-12 dark:bg-slate-950">
      <div className="mx-auto max-w-[1560px] px-4 pt-8 pb-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="h-8 w-1 shrink-0 rounded-full bg-primary dark:bg-blue-500" />
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight text-text dark:text-white sm:text-3xl">
                {t.ourServices}
              </h1>
              <p className="mt-1 text-sm font-semibold text-primary dark:text-blue-400">
                {t.appName}
              </p>
            </div>
            {!loading && (
              <p className="text-xs font-bold text-sub dark:text-slate-400">{serviceCountLabel}</p>
            )}
          </div>
        </div>

        {/* Category chips */}
        <div
          className="-mx-1 mb-8 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none"
          style={{ scrollbarWidth: 'none' }}
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          {FILTERS.map((f) => {
            const active = activeFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={`shrink-0 rounded-full border px-4 py-2 text-xs font-extrabold transition-colors ${
                  active
                    ? 'border-primary bg-primary text-white dark:border-blue-500 dark:bg-blue-600'
                    : 'border-border bg-white text-text hover:border-primary/40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-500/50'
                }`}
              >
                {t[f.labelKey] ?? f.id}
              </button>
            );
          })}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary dark:text-blue-400" />
            <p className="text-sm font-semibold text-sub dark:text-slate-400">{t.loadingServices}</p>
          </div>
        )}

        {/* Grid: 3 cards per row */}
        {!loading && filteredServices.length > 0 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredServices.map((svc) => (
              <ServiceCard
                key={svc._id || svc.id || svc.name}
                service={svc}
                onBook={handleBook}
              />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && filteredServices.length === 0 && (
          <div className="flex min-h-[36vh] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-white/50 px-6 py-14 dark:border-slate-700 dark:bg-slate-900/40">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
              <Inbox className="h-7 w-7 text-sub dark:text-slate-500" />
            </div>
            <p className="text-center text-sm font-extrabold text-text dark:text-white">
              {t.noServicesFound}
            </p>
            <button
              type="button"
              onClick={resetFilter}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-black text-white transition-colors hover:bg-primary-dark dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              <RefreshCw className="h-4 w-4" />
              {t.resetFilters}
            </button>
          </div>
        )}
      </div>

      {/* Footer info */}
      {!loading && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
          <p className="text-xs font-semibold text-sub dark:text-slate-500">{t.servicesUpdated}</p>
        </div>
      )}
    </div>
  );
}
