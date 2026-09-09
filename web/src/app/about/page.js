'use client';

import {
  Snowflake,
  Wrench,
  Home,
  Droplets,
  Sparkles,
  Phone,
  Mail,
  MapPin,
  Clock,
  Users,
  Award,
  Globe,
  Camera,
  X,
} from 'lucide-react';
import { useTranslation } from '@/contexts/TranslationContext';

const SERVICE_ITEMS = [
  { titleKey: 'acRepair', descKey: 'professionalRepair', Icon: Wrench },
  { titleKey: 'installation', descKey: 'expertInstallation', Icon: Home },
  { titleKey: 'gasRefill', descKey: 'refrigerantLeak', Icon: Droplets },
  { titleKey: 'cleaning', descKey: 'deepCleaningMaintenance', Icon: Sparkles },
  { titleKey: 'emergencyService', descKey: 'roundTheClockEmergency', Icon: Phone },
];

export default function AboutPage() {
  const { t, isRTL } = useTranslation();

  return (
    <div
      className="min-h-[60vh] bg-bg pb-16 dark:bg-slate-950"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-primary-light/80 to-bg dark:from-slate-900 dark:to-slate-950 dark:border-slate-800">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl dark:bg-blue-500/15" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-blue-400/10 blur-3xl dark:bg-blue-600/10" />
        <div className="mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <div className="flex flex-col items-center text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-white shadow-lg shadow-primary/15 ring-1 ring-primary/10 dark:bg-slate-800 dark:ring-blue-500/30">
              <Snowflake className="h-10 w-10 text-primary dark:text-blue-400" aria-hidden />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-text dark:text-white sm:text-4xl">
              {t.appName}
            </h1>
            <p className="mt-3 max-w-xl text-base font-semibold text-primary dark:text-blue-400">
              {t.trustedTagline}
            </p>
            <p className="mt-2 max-w-lg text-sm text-sub dark:text-slate-400">{t.brandTagline}</p>
            <div className="mt-10 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                { label: t.aboutStatYearsLabel, sub: t.yearsExperience },
                { label: t.aboutStatCustomersLabel, sub: t.customers },
                { label: t.aboutStatRatingLabel, sub: t.rating },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-border bg-white/80 px-5 py-4 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-800/80"
                >
                  <p className="text-lg font-black text-primary dark:text-blue-400">{stat.label}</p>
                  <p className="mt-1 text-xs font-semibold text-sub dark:text-slate-400">{stat.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1560px] space-y-16 px-4 pt-14 sm:px-6 lg:px-8">
        {/* Who We Are */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <span className="h-8 w-1 shrink-0 rounded-full bg-primary dark:bg-blue-500" />
            <h2 className="text-2xl font-black text-text dark:text-white">{t.whoWeAre}</h2>
          </div>
          <p className="max-w-3xl text-base leading-relaxed text-sub dark:text-slate-300">
            {t.aboutDescription}
          </p>
        </section>

        {/* Our Services */}
        <section>
          <div className="mb-6 flex items-center gap-3">
            <span className="h-8 w-1 shrink-0 rounded-full bg-primary dark:bg-blue-500" />
            <h2 className="text-2xl font-black text-text dark:text-white">{t.ourServicesTitle}</h2>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICE_ITEMS.map(({ titleKey, descKey, Icon }) => (
              <li
                key={titleKey}
                className="flex gap-4 rounded-2xl border border-border bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-light dark:bg-blue-950/80">
                  <Icon className="h-6 w-6 text-primary dark:text-blue-400" aria-hidden />
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-text dark:text-white">{t[titleKey]}</h3>
                  <p className="mt-1 text-sm text-sub dark:text-slate-400">{t[descKey]}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Our Team */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <span className="h-8 w-1 shrink-0 rounded-full bg-primary dark:bg-blue-500" />
            <h2 className="text-2xl font-black text-text dark:text-white">{t.ourTeam}</h2>
          </div>
          <p className="mb-8 max-w-3xl text-base leading-relaxed text-sub dark:text-slate-300">
            {t.teamDescription}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 inline-flex rounded-xl bg-primary-light p-3 dark:bg-blue-950/80">
                <Award className="h-6 w-6 text-primary dark:text-blue-400" aria-hidden />
              </div>
              <p className="text-3xl font-black text-primary dark:text-blue-400">15+</p>
              <p className="mt-1 font-bold text-text dark:text-white">{t.yearsExperience}</p>
            </div>
            <div className="rounded-2xl border border-border bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 inline-flex rounded-xl bg-primary-light p-3 dark:bg-blue-950/80">
                <Users className="h-6 w-6 text-primary dark:text-blue-400" aria-hidden />
              </div>
              <p className="text-3xl font-black text-primary dark:text-blue-400">2K+</p>
              <p className="mt-1 font-bold text-text dark:text-white">{t.happyCustomers}</p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
