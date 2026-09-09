'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Phone,
  MessageSquare,
  Wrench,
  Sparkles,
  Star,
  ChevronRight,
  MapPin,
  Calendar,
  ThumbsUp,
  DollarSign,
  Award,
  Zap,
  HelpCircle,
  Share2,
} from 'lucide-react';
import { useTranslation } from '@/contexts/TranslationContext';
import { getServiceById, getServices } from '@/lib/api';
import { getServiceImage } from '@/lib/serviceImages';
import ServiceCard from '@/components/ServiceCard';

const FALLBACK_SERVICES = [
  {
    _id: '1',
    name: 'AC Repair',
    nameAr: 'إصلاح المكيفات',
    description: 'Expert diagnostics and repair for all split, window, and central AC systems. We fix cooling issues, gas leaks, electrical faults, and unusual noises.',
    descriptionAr: 'تشخيص وإصلاح احترافي لجميع أنواع مكيفات الاسبليت والشباك والمركزي. نعالج مشاكل ضعف التبريد وتسريب الفريون والأعطال الكهربائية.',
    basePrice: 150,
    estimatedDuration: '1-2 hours',
    category: 'ac',
    isPopular: true,
    warrantyDays: 30,
  },
  {
    _id: '2',
    name: 'AC Installation',
    nameAr: 'تركيب المكيفات',
    description: 'Professional installation for new or relocated split and window air conditioners with vacuum testing and leak-free copper piping.',
    descriptionAr: 'تركيب احترافي لمكيفات الاسبليت والشباك الجديدة أو المنقولة مع فحص التفريغ وتمديد النحاس بدون تسريبات.',
    basePrice: 200,
    estimatedDuration: '2-3 hours',
    category: 'ac',
    isPopular: true,
    warrantyDays: 30,
  },
  {
    _id: '3',
    name: 'AC Deep Cleaning',
    nameAr: 'تنظيف وغسيل المكيفات',
    description: 'High-pressure jet wash and chemical sanitization of evaporator coils, blower fan, filters, and drain lines for maximum airflow and cooling.',
    descriptionAr: 'غسيل عميق بأجهزة ضغط الماء العالي ومواد التعقيم لملفات التبريد والمروحة والفلاتر ومجرى التصريف لزيادة كفاءة التبريد ونقاء الهواء.',
    basePrice: 100,
    estimatedDuration: '1-2 hours',
    category: 'ac',
    isPopular: true,
    warrantyDays: 30,
  },
  {
    _id: '4',
    name: 'Refrigerator Repair',
    nameAr: 'إصلاح الثلاجات',
    description: 'Comprehensive repair for all refrigerator and freezer brands. Thermostat replacement, compressor repair, defrost timer fixes, and gas charging.',
    descriptionAr: 'إصلاح شامل لجميع ماركات الثلاجات والفريزر. تغيير الثرموستات، صيانة الكمبروسر، معالجة تراكم الثلج وشحن الفريون الأصلي.',
    basePrice: 150,
    estimatedDuration: '1-2 hours',
    category: 'refrigerator',
    isPopular: true,
    warrantyDays: 30,
  },
];

const COMMON_PROBLEMS = {
  ac: [
    { en: 'AC blowing warm air / weak cooling', ar: 'المكيف يخرج هواء حار أو تبريد ضعيف' },
    { en: 'Water leaking or dripping inside room', ar: 'تسريب مياه وتنقيط داخل الغرفة' },
    { en: 'Strange whistling, rattling, or grinding noise', ar: 'أصوات غريبة أو طقطقة صادرة من المكيف' },
    { en: 'Foul or musty odor coming from airflow', ar: 'روائح كريهة أو غير محببة من فتحات الهواء' },
    { en: 'Compressor trips breaker or repeatedly shuts off', ar: 'الكمبروسر يفصل بشكل متكرر أو يقطع الكهرباء' },
    { en: 'Remote control not responding or error codes on display', ar: 'عدم استجابة الريموت أو ظهور رموز خطأ بالشاشة' },
  ],
  refrigerator: [
    { en: 'Fridge not cooling but freezer is working', ar: 'الثلاجة لا تبرد بينما الفريزر يعمل بشكل طبيعي' },
    { en: 'Excessive frost and ice buildup inside compartments', ar: 'تراكم الثلج الكثيف داخل الفريزر أو مروحة التبريد' },
    { en: 'Continuous clicking sound from compressor backside', ar: 'صوت نقر متكرر من كمبروسر الثلاجة في الخلف' },
    { en: 'Water pooling under vegetable drawers', ar: 'تجمع وتسريب مياه أسفل أدراج الخضروات' },
    { en: 'Food spoiling quickly due to irregular temperature', ar: 'تلف الأطعمة بسرعة بسبب عدم انتظام درجات الحرارة' },
  ],
  'washing-machine': [
    { en: 'Drum not spinning or tumbling during wash/rinse', ar: 'الحوض لا يدور أثناء الغسيل أو العصر' },
    { en: 'Water not draining out after cycle completion', ar: 'المياه لا تصرف بعد انتهاء دورة الغسيل' },
    { en: 'Excessive shaking, banging, and loud vibrations', ar: 'اهتزاز قوي واصطدام الحوض أثناء مرحلة التجفيف' },
    { en: 'Water leaking onto floor from front door or bottom', ar: 'تسريب مياه على الأرضية من الباب أو أسفل الغسالة' },
    { en: 'Door locked and will not open after cycle ends', ar: 'قفل الباب معلق ولا يفتح بعد انتهاء البرنامج' },
  ],
  stove: [
    { en: 'Gas burner not igniting or weak flame', ar: 'شعلة الفرن أو الموقد لا تشعل أو لهب ضعيف' },
    { en: 'Uneven baking and oven temperature control issues', ar: 'حرارة غير منتظمة في الفرن أو تلف الثرموستات' },
    { en: 'Gas odor or loose valve connection', ar: 'رائحة غاز أو خلل في صمامات الأمان والمفاتيح' },
    { en: 'Glass door hinge loose or electric ignition sparking continuously', ar: 'خلل في مفصلات الباب أو الشرر الكهربائي المستمر' },
  ],
  general: [
    { en: 'Appliance tripping circuit breaker upon turn-on', ar: 'الجهاز يفصل القاطع الكهربائي فور تشغيله' },
    { en: 'Overheating or burning smell during operation', ar: 'سخونة زائدة أو رائحة حرق أثناء عمل الجهاز' },
    { en: 'Unstable power supply or broken internal wiring', ar: 'تذبذب الكهرباء أو تلف الأسلاك والوصلات الداخلية' },
    { en: 'Control panel unresponsive or erratic behavior', ar: 'لوحة التحكم لا تستجيب أو تعطي أوامر عشوائية' },
  ],
};

const SERVICE_FAQS = [
  {
    qEn: 'How soon can a technician arrive at my location?',
    qAr: 'ما هي سرعة وصول الفني إلى موقعي؟',
    aEn: 'For standard bookings, we offer same-day service slots within 2 to 4 hours. In emergency cases in Jeddah & Makkah, our technicians can reach you in 60 to 90 minutes.',
    aAr: 'للحجوزات المعتادة نوفر مواعيد في نفس اليوم خلال ساعتين إلى ٤ ساعات. ولحالات الطوارئ في جدة ومكة يصل الفني خلال ٦٠ إلى ٩٠ دقيقة.',
  },
  {
    qEn: 'Do you provide a warranty on repairs and spare parts?',
    qAr: 'هل تقدمون ضماناً على الصيانة وقطع الغيار؟',
    aEn: 'Yes! All our services come with an official certified warranty. Any original replacement parts provided by us carry their manufacturer warranty.',
    aAr: 'نعم بالتأكيد! جميع خدماتنا تشمل ضمان صيانة رسمي ومعتمد. وقطع الغيار الأصلية الموردة من قبلنا تحمل ضمان المصنع.',
  },
  {
    qEn: 'Can I pay after the technician completes the service?',
    qAr: 'هل يمكنني الدفع بعد انتهاء الفني من العمل؟',
    aEn: 'Absolutely. You only pay after our certified technician inspects, repairs, tests your appliance, and you are 100% satisfied with the result.',
    aAr: 'بكل تأكيد. يتم الدفع فقط بعد فحص الجهاز وصيانته وتشغيله والتأكد من رضاك التام عن جودة الخدمة.',
  },
  {
    qEn: 'Which cities and areas do you cover?',
    qAr: 'ما هي المدن والأحياء التي تغطونها؟',
    aEn: 'We provide full coverage across all neighborhoods of Jeddah and Makkah with our mobile technician fleet.',
    aAr: 'نغطي كافة أحياء مدينتي جدة ومكة المكرمة عبر أسطول فنيين متنقل ومجهز بالكامل.',
  },
];

export default function ServiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t, language, isRTL, toAr, formatPrice } = useTranslation();

  const [service, setService] = useState(null);
  const [allServices, setAllServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const serviceId = params?.id;

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [singleRes, allRes] = await Promise.allSettled([
          getServiceById(serviceId),
          getServices(),
        ]);

        let currentService = null;
        if (singleRes.status === 'fulfilled' && singleRes.value) {
          currentService = singleRes.value.service || singleRes.value;
        }

        let servicesList = [];
        if (allRes.status === 'fulfilled' && allRes.value) {
          servicesList = allRes.value.services || allRes.value.data || allRes.value;
        }

        if (Array.isArray(servicesList) && servicesList.length) {
          setAllServices(servicesList);
          if (!currentService) {
            currentService = servicesList.find((s) => (s._id || s.id) === serviceId);
          }
        }

        if (!currentService) {
          currentService = FALLBACK_SERVICES.find((s) => s._id === serviceId) || FALLBACK_SERVICES[0];
        }

        setService(currentService);
      } catch {
        const fallback = FALLBACK_SERVICES.find((s) => s._id === serviceId) || FALLBACK_SERVICES[0];
        setService(fallback);
      } finally {
        setLoading(false);
      }
    }

    if (serviceId) {
      fetchData();
    }
  }, [serviceId]);

  const name = useMemo(() => {
    if (!service) return '';
    return (language === 'ar' ? service.nameAr : null) || service.name || t.service;
  }, [service, language, t.service]);

  const desc = useMemo(() => {
    if (!service) return '';
    return (
      (language === 'ar' ? service.descriptionAr : null) ||
      service.description ||
      ''
    );
  }, [service, language]);

  const category = service?.category || 'ac';
  const price = service?.basePrice ?? 150;
  const duration = service?.estimatedDuration || '1-2 hours';
  const warrantyDays = service?.warrantyDays || 30;
  const imgSrc = getServiceImage(service?.name, category);

  // Related services (same category or popular, excluding current)
  const relatedServices = useMemo(() => {
    const pool = allServices.length ? allServices : FALLBACK_SERVICES;
    return pool
      .filter((s) => (s._id || s.id) !== serviceId)
      .filter((s) => !category || s.category === category || s.isPopular)
      .slice(0, 4);
  }, [allServices, serviceId, category]);

  // WhatsApp link
  const whatsappUrl = useMemo(() => {
    const phone = '966590192146';
    const text =
      language === 'ar'
        ? `السلام عليكم، أود الاستفسار وحجز خدمة (${name}) من ورشة أحمد للتبريد.`
        : `Hello Ahmed Cooling Workshop, I would like to book the service: ${name}.`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }, [name, language]);

  const handleShare = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleBook = () => {
    if (serviceId) {
      router.push(`/book/${serviceId}`);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-bg dark:bg-slate-950">
        <Loader2 className="h-10 w-10 animate-spin text-primary dark:text-blue-400" />
        <p className="text-sm font-semibold text-sub dark:text-slate-400">
          {t.loadingServices || 'Loading service details...'}
        </p>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-4 text-center">
        <AlertTriangle className="h-12 w-12 text-amber-500 mb-3" />
        <h2 className="text-xl font-black text-slate-900 dark:text-white">
          {t.serviceNotFound || 'Service Not Found'}
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {t.serviceNotFoundDesc || 'The requested service could not be found.'}
        </p>
        <Link
          href="/services"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-black text-white hover:bg-primary-dark transition"
        >
          {t.backToServices || 'Back to Services'}
        </Link>
      </div>
    );
  }

  const issuesList = COMMON_PROBLEMS[category] || COMMON_PROBLEMS.general;

  return (
    <div className="min-h-screen bg-bg pb-16 dark:bg-slate-950" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* ═══ BREADCRUMB (ALIGNED WITH NAVBAR) ═══ */}
      <div className="border-b border-slate-200/80 bg-white/70 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mx-auto max-w-[1560px] flex items-center gap-2 px-4 sm:px-6 lg:px-8 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <Link href="/" className="hover:text-primary transition-colors">
            {t.home}
          </Link>
          <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180 text-slate-400" />
          <Link href="/services" className="hover:text-primary transition-colors">
            {t.services}
          </Link>
          <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180 text-slate-400" />
          <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
            {name}
          </span>
        </div>
      </div>

      <main className="mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8 pt-6">
        {/* ═══ MAIN GRID: LEFT CONTENT (7 cols) + RIGHT STICKY CARD (5 cols) ═══ */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* LEFT COLUMN (7 COLS) */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-8">
            {/* HERO MEDIA CARD */}
            <div className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="relative h-72 sm:h-96 w-full overflow-hidden">
                <img
                  src={imgSrc}
                  alt={name}
                  className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                />
                {/* Gradient overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950/40 via-transparent to-transparent" />

                {/* Badges on Top */}
                <div className="absolute top-4 inset-x-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-lg">
                      <Sparkles className="h-3.5 w-3.5" />
                      {language === 'ar' ? 'خدمة معتمدة' : 'Verified Service'}
                    </span>
                    {(service.isPopular || service.popular) && (
                      <span className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-blue-600 to-primary px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-blue-500/30 border border-white/20">
                        <Star className="h-3.5 w-3.5 fill-white text-white" />
                        {language === 'ar' ? 'الأكثر طلباً' : 'Popular Choice'}
                      </span>
                    )}
                    {(service.isEmergency || service.emergency) && (
                      <span className="inline-flex items-center gap-1 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-black text-white shadow-lg animate-pulse">
                        🚨 {language === 'ar' ? 'طوارئ ٢٤/٧' : '24/7 Emergency'}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleShare}
                    aria-label="Share service"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-black/40 backdrop-blur-md px-3 py-1.5 text-xs font-bold text-white transition hover:bg-black/60 shadow"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    {copied ? (language === 'ar' ? 'تم النسخ!' : 'Copied!') : (language === 'ar' ? 'مشاركة' : 'Share')}
                  </button>
                </div>

                {/* Service Title & Rating inside Hero bottom */}
                <div className="absolute bottom-4 inset-x-4 sm:bottom-6 sm:inset-x-6 text-white">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/90 backdrop-blur-sm px-2.5 py-0.5 text-xs font-black text-white">
                      <Shield className="h-3 w-3" />
                      {language === 'ar' ? 'ضمان رسمي معتمد' : 'Certified Warranty'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-300">
                      <Star className="h-3.5 w-3.5 fill-current" />
                      4.9 / 5.0
                    </span>
                    <span className="text-xs text-slate-300 font-medium">
                      (500+ {language === 'ar' ? 'عميل راضٍ' : 'Happy Clients'})
                    </span>
                  </div>

                  <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-white drop-shadow-sm">
                    {name}
                  </h1>
                </div>
              </div>

              {/* Quick Info Bar below Hero image */}
              <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 bg-slate-50/70 p-4 rtl:divide-x-reverse dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/60 sm:grid-cols-4">
                <div className="p-2 text-center">
                  <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    {t.startingFrom || 'Starting from'}
                  </span>
                  <span className="text-base sm:text-lg font-bold text-primary dark:text-blue-400">
                    {formatPrice(price)}
                  </span>
                </div>
                <div className="p-2 text-center">
                  <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    {language === 'ar' ? 'المدة التقديرية' : 'Estimated Time'}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                    {toAr(duration)}
                  </span>
                </div>
                <div className="p-2 text-center">
                  <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    {language === 'ar' ? 'الضمان' : 'Warranty'}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {language === 'ar' ? 'شامل ومعتمد' : '100% Certified'}
                  </span>
                </div>
                <div className="p-2 text-center">
                  <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    {language === 'ar' ? 'التغطية' : 'Coverage'}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                    {language === 'ar' ? 'جدة ومكة' : 'Jeddah & Makkah'}
                  </span>
                </div>
              </div>
            </div>

            {/* SERVICE OVERVIEW & DESCRIPTION */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4 flex items-center gap-3">
                <div className="h-6 w-1 rounded-full bg-primary" />
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  {t.serviceDetails || 'Service Overview'}
                </h2>
              </div>
              <p className="text-sm sm:text-base leading-relaxed text-slate-700 dark:text-slate-300 font-medium whitespace-pre-line">
                {desc}
              </p>

              {/* 4 HIGHLIGHT PILLARS */}
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-primary dark:bg-blue-900/40 dark:text-blue-300">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {language === 'ar' ? 'ضمان صيانة رسمي ومعتمد' : 'Official Certified Warranty'}
                    </h4>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 leading-normal font-medium">
                      {language === 'ar' ? 'ضمان شامل ومكتوب على جودة العمل وقطع الغيار.' : 'Complete peace of mind covering parts and labor.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {language === 'ar' ? 'وصول سريع ومواعيد دقيقة' : 'Same-Day Fast Response'}
                    </h4>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 leading-normal font-medium">
                      {language === 'ar' ? 'فريق متنقل يصلك خلال ساعتين أو ٦٠ دقيقة للطوارئ.' : 'Technician dispatched to your door within 60-90 mins.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300">
                    <Award className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {t.certifiedTechnicians || 'Certified Technicians'}
                    </h4>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 leading-normal font-medium">
                      {language === 'ar' ? 'فنيون مدربون بخبرة تزيد عن ١٠ سنوات في المملكة.' : 'Vetted, highly skilled professionals with 10+ yrs experience.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {t.transparentEstimate || 'Transparent Pricing'}
                    </h4>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 leading-normal font-medium">
                      {t.payAfterService || 'Pay after service is completed & inspected.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* WHAT'S INCLUDED IN THIS SERVICE */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-6 flex items-center gap-3">
                <div className="h-6 w-1 rounded-full bg-primary" />
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  {t.whatsIncluded || "What's Included in This Service"}
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {[
                  { en: 'Comprehensive on-site diagnostics & fault detection', ar: 'فحص وتشخيص شامل للأعطال في الموقع' },
                  { en: 'Pressure, electrical current & safety test', ar: 'فحص ضغط الغاز وتيار الكهرباء وإجراءات السلامة' },
                  { en: 'Professional repair using specialized industrial tools', ar: 'إصلاح احترافي بأحدث الأدوات والمعدات المتخصصة' },
                  { en: 'Original manufacturer-grade spare parts guarantee', ar: 'ضمان استخدام قطع غيار أصلية ومطابقة للمواصفات' },
                  { en: 'Post-repair cooling / functionality performance verification', ar: 'اختبار كفاءة التبريد والأداء بعد الانتهاء' },
                  { en: 'Complete worksite cleanup and debris disposal', ar: 'تنظيف كامل لمكان العمل بعد إتمام الصيانة' },
                  { en: 'Official certified service warranty certificate', ar: 'سند وشهادة ضمان معتمد على الصيانة' },
                  { en: 'Dedicated phone & WhatsApp support after service', ar: 'دعم ومتابعة مستمرة عبر الهاتف والواتساب بعد الزيارة' },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {language === 'ar' ? item.ar : item.en}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* COMMON PROBLEMS WE SOLVE */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-6 flex items-center gap-3">
                <div className="h-6 w-1 rounded-full bg-primary" />
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  {t.commonIssues || 'Common Problems We Solve'}
                </h2>
              </div>

              <div className="space-y-3">
                {issuesList.map((prob, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3.5 rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:bg-slate-100/80 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:bg-slate-800"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400 text-xs font-black">
                      #{idx + 1}
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                      {language === 'ar' ? prob.ar : prob.en}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 4-STEP REPAIR PROCESS */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-6 flex items-center gap-3">
                <div className="h-6 w-1 rounded-full bg-primary" />
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  {t.serviceProcess || 'Our Repair Process'}
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative rounded-2xl border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-800/40">
                  <span className="text-3xl font-bold text-primary/30 dark:text-blue-500/30">01</span>
                  <h3 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                    {t.step1Title}
                  </h3>
                  <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t.step1Desc}
                  </p>
                </div>

                <div className="relative rounded-2xl border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-800/40">
                  <span className="text-3xl font-bold text-primary/30 dark:text-blue-500/30">02</span>
                  <h3 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                    {t.step2Title}
                  </h3>
                  <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t.step2Desc}
                  </p>
                </div>

                <div className="relative rounded-2xl border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-800/40">
                  <span className="text-3xl font-bold text-primary/30 dark:text-blue-500/30">03</span>
                  <h3 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                    {t.step3Title}
                  </h3>
                  <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t.step3Desc}
                  </p>
                </div>

                <div className="relative rounded-2xl border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-800/40">
                  <span className="text-3xl font-bold text-primary/30 dark:text-blue-500/30">04</span>
                  <h3 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                    {t.step4Title}
                  </h3>
                  <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t.step4Desc}
                  </p>
                </div>
              </div>
            </div>

            {/* FAQS ACCORDION / LIST */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-6 flex items-center gap-3">
                <div className="h-6 w-1 rounded-full bg-primary" />
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  {language === 'ar' ? 'الأسئلة الشائعة حول الخدمة' : 'Frequently Asked Questions'}
                </h2>
              </div>

              <div className="space-y-4">
                {SERVICE_FAQS.map((faq, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div className="flex items-center gap-2">
                      <HelpCircle className="h-4 w-4 text-primary shrink-0" />
                      <h4 className="text-sm font-black text-slate-900 dark:text-white">
                        {language === 'ar' ? faq.qAr : faq.qEn}
                      </h4>
                    </div>
                    <p className="mt-2 text-xs sm:text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-300 ps-6">
                      {language === 'ar' ? faq.aAr : faq.aEn}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (5 COLS - STICKY BOOKING CARD) */}
          <div className="lg:col-span-5 xl:col-span-4">
            <div className="sticky top-24 space-y-6">
              {/* PRIMARY ACTION CARD */}
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
                {/* Header Price Section */}
                <div className="border-b border-slate-100 pb-5 dark:border-slate-800">
                  <span className="inline-block rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-primary dark:bg-blue-950/60 dark:text-blue-400">
                    {t.startingFrom || 'Starting from'}
                  </span>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
                      {formatPrice(price)}
                    </span>
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      / {language === 'ar' ? 'زيارة وفحص' : 'Visit & Service'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t.payAfterService || 'Pay only after service is completed & inspected.'}
                  </p>
                </div>

                {/* Service Specs summary */}
                <div className="space-y-3 py-5 text-xs font-bold">
                  <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <Clock className="h-4 w-4 text-primary" />
                      {language === 'ar' ? 'المدة التقديرية:' : 'Duration:'}
                    </span>
                    <span>{toAr(duration)}</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <Shield className="h-4 w-4 text-emerald-500" />
                      {language === 'ar' ? 'حالة الضمان:' : 'Warranty:'}
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {language === 'ar' ? 'شامل ومعتمد' : '100% Certified'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <MapPin className="h-4 w-4 text-red-500" />
                      {language === 'ar' ? 'مناطق التغطية:' : 'Available in:'}
                    </span>
                    <span>{language === 'ar' ? 'جدة ومكة المكرمة' : 'Jeddah & Makkah'}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3 pt-2">
                  {/* Primary CTA: Book Now */}
                  <button
                    type="button"
                    onClick={handleBook}
                    className="group relative flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-sm font-black text-white shadow-md shadow-primary/25 transition-all hover:bg-primary-dark hover:shadow-lg hover:shadow-primary/30 active:scale-98"
                  >
                    <span>{t.bookNow}</span>
                    {isRTL ? (
                      <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                    ) : (
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    )}
                  </button>

                  {/* Secondary CTA: WhatsApp */}
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-xs sm:text-sm font-black text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-98"
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span>{t.bookViaWhatsApp || 'Book via WhatsApp'}</span>
                  </a>

                  {/* Hotline Phone Call */}
                  <a
                    href="tel:+966590192146"
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 py-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-750"
                  >
                    <Phone className="h-3.5 w-3.5 text-primary" />
                    <span>{t.callTechnician || 'Emergency Call'}: +966 59 019 2146</span>
                  </a>
                </div>

                {/* Trust footer inside card */}
                <div className="mt-6 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>{language === 'ar' ? 'إلغاء وتعديل مجاني للموعد' : 'Free Rescheduling & Cancellation'}</span>
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 ps-6">
                    {language === 'ar'
                      ? 'يمكنك تعديل الموعد أو إلغاؤه في أي وقت قبل انطلاق الفني.'
                      : 'Modify your time slot easily with no extra fees before dispatch.'}
                  </p>
                </div>
              </div>

              {/* EMERGENCY CALLOUT CARD */}
              <div className="overflow-hidden rounded-3xl border border-red-200 bg-gradient-to-br from-red-50 to-orange-50 p-5 dark:border-red-900/50 dark:from-red-950/30 dark:to-orange-950/20">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-white shadow-sm">
                    <Phone className="h-5 w-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-red-950 dark:text-red-200">
                      {language === 'ar' ? 'هل لديك عطل طارئ؟' : 'Need Emergency Repairs?'}
                    </h4>
                    <p className="text-xs text-red-800/80 dark:text-red-300 font-medium">
                      {language === 'ar' ? 'فريقنا متاح ٢٤/٧ في جدة ومكة' : '24/7 priority technician dispatch'}
                    </p>
                  </div>
                </div>
                <a
                  href="tel:+966590192146"
                  className="mt-4 block w-full rounded-xl bg-red-600 py-2.5 text-center text-xs font-black text-white shadow hover:bg-red-700 transition"
                >
                  {language === 'ar' ? 'اتصل الآن: ٠٥٩٠١٩٢١٤٦' : 'Call: +966 59 019 2146'}
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ RELATED SERVICES (CAROUSEL / GRID) ═══ */}
        {relatedServices.length > 0 && (
          <section className="mt-16 border-t border-slate-200/80 pt-12 dark:border-slate-800">
            <div className="mb-8 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-6 w-1 rounded-full bg-primary" />
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                  {t.relatedServices || 'Related Services'}
                </h2>
              </div>
              <Link
                href="/services"
                className="text-xs sm:text-sm font-bold text-primary hover:text-primary-dark transition"
              >
                {t.seeAll || 'View All'} →
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {relatedServices.slice(0, 3).map((svc) => (
                <ServiceCard
                  key={svc._id || svc.id || svc.name}
                  service={svc}
                  onBook={(s) => router.push(`/book/${s._id || s.id}`)}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
