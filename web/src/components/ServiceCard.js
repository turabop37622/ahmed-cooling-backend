'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Clock,
  ArrowRight,
  ArrowLeft,
  Star,
  Snowflake,
  Sparkles,
  Wrench,
  Flame,
  CheckCircle2,
  ShieldCheck,
  Refrigerator,
  WashingMachine,
} from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';
import { getServiceImage } from '../lib/serviceImages';

const getCategoryMeta = (cat, serviceName, lang) => {
  const c = String(cat || '').toLowerCase();
  const s = String(serviceName || '').toLowerCase();

  // 1. Washing Machine (checked before AC so 'machine' doesn't match 'ac')
  if (c.includes('wash') || s.includes('wash') || s.includes('غسال')) {
    return {
      label: lang === 'ar' ? 'غسالات ومجففات' : 'Washing Machines',
      icon: WashingMachine,
      color: 'text-indigo-300',
    };
  }

  // 2. Refrigerators & Freezers
  if (
    c.includes('refrigerator') ||
    c.includes('fridge') ||
    c.includes('freezer') ||
    s.includes('refrigerator') ||
    s.includes('fridge') ||
    s.includes('ثلاج') ||
    s.includes('فريزر')
  ) {
    return {
      label: lang === 'ar' ? 'ثلاجات وتبريد' : 'Refrigerators',
      icon: Refrigerator,
      color: 'text-cyan-300',
    };
  }

  // 3. Stoves & Ovens
  if (c.includes('stove') || c.includes('oven') || s.includes('stove') || s.includes('oven') || s.includes('فرن') || s.includes('بوتاجاز')) {
    return {
      label: lang === 'ar' ? 'أفران وبوتاجاز' : 'Stoves & Ovens',
      icon: Flame,
      color: 'text-amber-300',
    };
  }

  // 4. Air Conditioning
  if (
    c === 'ac' ||
    c.startsWith('ac') ||
    c.includes('air') ||
    c.includes('conditioning') ||
    s.includes('ac ') ||
    s.includes(' ac') ||
    s.includes('air cond') ||
    s.includes('تكييف') ||
    s.includes('مكيف')
  ) {
    return {
      label: lang === 'ar' ? 'تكييف وتبريد' : 'Air Conditioning',
      icon: Snowflake,
      color: 'text-sky-300',
    };
  }

  return {
    label: lang === 'ar' ? 'صيانة متخصصة' : 'Appliance Care',
    icon: Wrench,
    color: 'text-blue-300',
  };
};

export default function ServiceCard({ service, onBook }) {
  const router = useRouter();
  const { t, language, isRTL, toAr, formatPrice } = useTranslation();

  const id = service._id || service.id;
  const name =
    (language === 'ar' ? service.nameAr : null) || service.name || t.service;
  const desc =
    (language === 'ar' ? service.descriptionAr : null) ||
    service.description ||
    '';
  const price = service.basePrice ?? 0;
  const rawDuration = service.estimatedDuration || service.duration || '1-2 hours';
  const displayDuration =
    language === 'ar'
      ? toAr(rawDuration).replace(/hours?/gi, 'ساعة')
      : rawDuration;

  const imgSrc = getServiceImage(service.name, service.category);
  const detailUrl = id ? `/services/${id}` : '/services';
  const catMeta = getCategoryMeta(service.category, service.name, language);
  const CategoryIcon = catMeta.icon;

  const handleCardClick = (e) => {
    // Let clicks inside links or buttons take their own action
    if (e.target.closest('button') || e.target.closest('a')) return;
    router.push(detailUrl);
  };

  const handleBookClick = (e) => {
    e.stopPropagation();
    if (onBook) {
      onBook(service);
    } else if (id) {
      router.push(`/book/${id}`);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className="group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-[0_20px_40px_-15px_rgba(37,99,235,0.18)] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/40 dark:hover:shadow-[0_20px_40px_-15px_rgba(37,99,235,0.28)]"
    >
      {/* ═══ Top Photography Header ═══ */}
      <div className="relative h-48 sm:h-52 w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        <img
          src={imgSrc}
          alt={name}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-108"
          loading="lazy"
        />

        {/* Cinematic dark gradient vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-black/10" />

        {/* Top Floating Badges */}
        <div className="absolute top-3.5 inset-x-3.5 flex items-center justify-between pointer-events-none">
          {/* Glassmorphic Category Badge */}
          <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-950/60 backdrop-blur-md border border-white/20 px-3 py-1 text-xs font-bold text-white shadow-md shadow-black/20">
            <CategoryIcon className={`h-3.5 w-3.5 ${catMeta.color}`} />
            <span>{catMeta.label}</span>
          </div>

          {/* Popular / Featured Pill */}
          {(service.isPopular || service.popular) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-600 to-primary px-3 py-1 text-[11px] font-bold text-white shadow-md shadow-blue-500/30 border border-white/20">
              <Star className="h-3 w-3 fill-white text-white" />
              <span>{language === 'ar' ? 'الأكثر طلباً' : 'Popular'}</span>
            </span>
          )}
        </div>

        {/* Bottom Floating Bar on Image */}
        <div className="absolute bottom-3.5 inset-x-3.5 flex items-center justify-between pointer-events-none">
          <div className="inline-flex items-center gap-1.5 rounded-lg bg-black/60 backdrop-blur-md px-2.5 py-1 text-[11px] font-semibold text-slate-200 border border-white/10 shadow-sm">
            <Clock className="h-3.5 w-3.5 text-sky-400" />
            <span>{displayDuration}</span>
          </div>
        </div>
      </div>

      {/* ═══ Card Body Content ═══ */}
      <div className="flex flex-1 flex-col p-5 text-start">
        {/* Subtle Category Micro-indicator */}
        <div className="mb-2 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary ring-4 ring-primary/10" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-primary dark:text-blue-400">
            {catMeta.label}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold tracking-tight text-slate-900 transition-colors group-hover:text-primary dark:text-white dark:group-hover:text-blue-400">
          {name}
        </h3>

        {/* Description */}
        <p className="mt-1.5 line-clamp-2 text-xs sm:text-sm font-normal leading-relaxed text-slate-500 dark:text-slate-400">
          {desc}
        </p>

        {/* Micro Trust Indicators */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/70 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span>{language === 'ar' ? 'فني معتمد' : 'Certified Tech'}</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/70 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
            <span>{language === 'ar' ? 'قطع أصلية' : 'Genuine Parts'}</span>
          </div>
        </div>

        {/* ═══ Interactive Bottom Action Shelf ═══ */}
        <div className="mt-5 pt-4 border-t border-slate-150/80 dark:border-slate-800 flex items-center justify-between gap-2">
          {/* Price Stack */}
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t.startingFrom || 'Starting from'}
            </span>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {formatPrice(price)}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Link
              href={detailUrl}
              className="group/details inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-primary/50 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/10 transition-all"
              title={t.viewDetails || 'Details'}
            >
              <span>{t.viewDetails || 'Details'}</span>
              {isRTL ? (
                <ArrowLeft className="h-3.5 w-3.5 ms-1 transition-transform group-hover/details:-translate-x-1" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5 ms-1 transition-transform group-hover/details:translate-x-1" />
              )}
            </Link>

            <button
              type="button"
              onClick={handleBookClick}
              className="relative inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-primary via-blue-600 to-primary-dark px-4 py-2.5 text-xs font-black text-white shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/40 hover:scale-[1.02] active:scale-95 transition-all duration-200"
            >
              <span>{t.bookNow}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}