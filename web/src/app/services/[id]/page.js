'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
  ArrowUp,
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
  Send,
  User,
} from 'lucide-react';
import { useTranslation } from '@/contexts/TranslationContext';
import { getServiceById, getServices } from '@/lib/api';
import { getServiceImage } from '@/lib/serviceImages';
import ServiceCard from '@/components/ServiceCard';

const FALLBACK_SERVICES = [
  {
    _id: '1',
    id: '1',
    name: 'AC Repair & Diagnostics',
    nameAr: 'صيانة وفحص المكيفات',
    description: 'Expert diagnostics and repair for all split, window, and central AC systems. We fix cooling faults, gas leaks, electrical issues, and unusual noises.',
    descriptionAr: 'تشخيص وإصلاح احترافي لجميع أنواع مكيفات الاسبليت والشباك والمركزي. صيانة ضعف التبريد وتسريب الفريون والأعطال الكهربائية.',
    basePrice: 150,
    estimatedDuration: '1-2 hours',
    category: 'ac',
    isPopular: true,
    warrantyDays: 30,
  },
  {
    _id: '2',
    id: '2',
    name: 'AC Installation & Dismantling',
    nameAr: 'تركيب وفك مكيفات سبليت وشباك',
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
    id: '3',
    name: 'AC Deep Cleaning & Sanitization',
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
    id: '4',
    name: 'Refrigerator & Freezer Repair',
    nameAr: 'إصلاح الثلاجات والفريزر',
    description: 'Comprehensive repair for all refrigerator and freezer brands. Thermostat replacement, compressor repair, defrost timer fixes, and gas charging.',
    descriptionAr: 'إصلاح شامل لجميع ماركات الثلاجات والفريزر. تغيير الثرموستات، صيانة الكمبروسر، معالجة تراكم الثلج وشحن الفريون الأصلي.',
    basePrice: 150,
    estimatedDuration: '1-2 hours',
    category: 'refrigerator',
    isPopular: true,
    warrantyDays: 30,
  },
  {
    _id: '5',
    id: '5',
    name: 'Washing Machine Repair',
    nameAr: 'إصلاح وصيانة الغسالات',
    description: 'Expert repair for front-load and top-load washers: motor issues, water drainage, noisy bearings, and electronic PCB boards.',
    descriptionAr: 'إصلاح جميع أنواع الغسالات الأوتوماتيك والعادية: مشاكل دوران الحوض، طرد المياه، اهتزاز التجفيف ولوحات التحكم.',
    basePrice: 140,
    estimatedDuration: '1-2 hours',
    category: 'washing-machine',
    isPopular: true,
    warrantyDays: 30,
  },
  {
    _id: '6',
    id: '6',
    name: 'AC Gas Refill (Freon R410A / R22)',
    nameAr: 'تعبئة غاز فريون أصلي',
    description: 'Starting from 180 SAR (prices vary depending on gas type R410A/R22 & quantity needed). Pressure test, leak detection, complete evacuation, and 100% genuine refrigerant refill.',
    descriptionAr: 'يبدأ من 180 ريال (تختلف القيمة حسب نوع الغاز R410A / R22 وكمية الشحن المطلوبة). شحن فريون أصلي مع كشف وتصليح مكان التسريب وفحص الضغوط.',
    basePrice: 180,
    estimatedDuration: '1 hour',
    category: 'ac',
    isPopular: true,
    warrantyDays: 30,
  },
  {
    _id: '7',
    id: '7',
    name: 'Cooking Stove & Oven Repair',
    nameAr: 'صيانة الأفران والبوتاجازات',
    description: 'Burner cleaning, ignition fixes, thermostat replacement, and gas safety checks.',
    descriptionAr: 'صيانة شعلات الغاز وتغيير الحساسات وضبط درجات حرارة الأفران.',
    basePrice: 160,
    estimatedDuration: '1-2 hours',
    category: 'stove',
    isPopular: false,
    warrantyDays: 30,
  },
  {
    _id: 'pkg_villa',
    id: 'pkg_villa',
    name: 'Annual Villa Care - Full Home Maintenance',
    nameAr: 'عقد رعاية سنوية للفلل والمنازل',
    description: '4 seasonal AC maintenance visits, VIP priority 24/7 hotline dispatch, and 20% off all spare parts.',
    descriptionAr: '٤ زيارات فحص دوري للمكيفات مع صيانة طوارئ ذات أولوية قصوى وخصم ٢٠٪ على قطع الغيار.',
    basePrice: 1200,
    estimatedDuration: 'Annual Contract',
    category: 'general',
    isPopular: true,
    warrantyDays: 365,
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
    aEn: 'For standard bookings, we offer same-day service slots within 2 to 4 hours. In emergency cases across Saudi Arabia (Jeddah & Makkah), our mobile technicians can reach you in 60 to 90 minutes.',
    aAr: 'للحجوزات المعتادة نوفر مواعيد في نفس اليوم خلال ساعتين إلى ٤ ساعات. ولحالات الطوارئ في السعودية (جدة ومكة) يصل الفني خلال ٦٠ إلى ٩٠ دقيقة.',
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
    aEn: 'We provide full coverage across Saudi Arabia (Jeddah, Makkah) with our fully-equipped mobile technician fleet.',
    aAr: 'نغطي كافة مناطق المملكة العربية السعودية (جدة، مكة المكرمة) عبر أسطول فنيين متنقل ومجهز بالكامل.',
  },
];

const INITIAL_SERVICE_REVIEWS = [
  {
    id: 'rev-ksa-1',
    name: 'محمد العمري',
    nameEn: 'Mohammed Al-Omari',
    city: 'جدة',
    cityEn: 'Jeddah',
    rating: 5,
    date: 'منذ يومين',
    dateEn: '2 days ago',
    comment: 'خدمة راقية جداً وسريعة في جدة. الفني فحص التكييف بدقة وقام بتغيير القطعة المطلوبة واختبر البرودة بكفاءة عالية.',
    commentEn: 'Excellent service in Jeddah! The technician inspected our AC thoroughly, replaced the faulty component, and verified optimal cooling performance.',
    likes: 11,
  },
  {
    id: 'rev-1',
    name: 'عبدالله السلمي',
    nameEn: 'Abdullah Al-Sulami',
    city: 'جدة',
    cityEn: 'Jeddah',
    rating: 5,
    date: 'منذ ٣ أيام',
    dateEn: '3 days ago',
    comment: 'ما شاء الله تبارك الله، الفني وصل في الموعد تماماً وكان خلوقاً ومحترفاً جداً. فحص الجهاز وكشف سبب العطل بدقة وصلحه واختبر التبريد قبل أن يغادر. أنصح بالتعامل معهم بشدة.',
    commentEn: 'Excellent service! The technician arrived right on time, diagnosed the issue quickly, and tested everything thoroughly before leaving. Highly recommended.',
    likes: 12,
  },
  {
    id: 'rev-2',
    name: 'أم فيصل الشريف',
    nameEn: 'Um Faisal Al-Sharif',
    city: 'مكة المكرمة',
    cityEn: 'Makkah',
    rating: 5,
    date: 'منذ أسبوع',
    dateEn: '1 week ago',
    comment: 'خدمة سريعة وممتازة وسعرهم واضح من البداية بدون أي رسوم خفية. وتم تسليمي سند ضمان رسمي معتمد على الصيانة.',
    commentEn: 'Fast and reliable service with clear upfront pricing. They provided an official certified warranty receipt for the service.',
    likes: 8,
  },
  {
    id: 'rev-3',
    name: 'سلطان الحربي',
    nameEn: 'Sultan Al-Harbi',
    city: 'جدة',
    cityEn: 'Jeddah',
    rating: 5,
    date: 'منذ أسبوعين',
    dateEn: '2 weeks ago',
    comment: 'تعاملت مع عدة فنيين من قبل لكن ورشة أحمد للتبريد أفضلهم أمانة ودقة في المواعيد. الجهاز شغال ممتاز كأنه جديد.',
    commentEn: 'Best cooling and appliance service team in Jeddah. Repaired the fault on the first visit with great honesty and precision.',
    likes: 15,
  },
  {
    id: 'rev-4',
    name: 'رنا الغامدي',
    nameEn: 'Rana Al-Ghamdi',
    city: 'مكة المكرمة',
    cityEn: 'Makkah',
    rating: 4,
    date: 'منذ شهر',
    dateEn: '1 month ago',
    comment: 'فريق محترم جداً والتزام تام بالمواعيد ونظافة تامة أثناء العمل بعد الانتهاء. شكراً جزيلاً لكم.',
    commentEn: 'Very respectful crew, on-time arrival and clean work throughout. Thank you very much.',
    likes: 6,
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
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const mobileBookingCardRef = useRef(null);

  // Reviews state
  const [reviewsList, setReviewsList] = useState(INITIAL_SERVICE_REVIEWS);
  const [reviewName, setReviewName] = useState('');
  const [reviewCity, setReviewCity] = useState('جدة');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewHoverRating, setReviewHoverRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [likedReviews, setLikedReviews] = useState({});

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);

      if (mobileBookingCardRef.current) {
        const rect = mobileBookingCardRef.current.getBoundingClientRect();
        // Show sticky bottom bar only when top booking card has scrolled out of view
        setShowStickyBar(rect.bottom < 60);
      } else {
        setShowStickyBar(window.scrollY > 400);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const serviceId = params?.id;

  // Load any locally saved reviews for this service
  useEffect(() => {
    if (!serviceId) return;
    try {
      const saved = localStorage.getItem(`service_reviews_${serviceId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setReviewsList([...parsed, ...INITIAL_SERVICE_REVIEWS]);
        }
      }
    } catch {
      // ignore
    }
  }, [serviceId]);

  const handleToggleLike = (id) => {
    setLikedReviews((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleSubmitReview = (e) => {
    e.preventDefault();
    if (!reviewName.trim() || !reviewComment.trim()) return;

    const newRev = {
      id: `rev-custom-${Date.now()}`,
      name: reviewName.trim(),
      nameEn: reviewName.trim(),
      city: reviewCity,
      cityEn: reviewCity === 'جدة' ? 'Jeddah' : 'Makkah',
      rating: reviewRating,
      date: language === 'ar' ? 'الآن' : 'Just now',
      dateEn: 'Just now',
      comment: reviewComment.trim(),
      commentEn: reviewComment.trim(),
      likes: 1,
      isNew: true,
    };

    const updated = [newRev, ...reviewsList];
    setReviewsList(updated);

    try {
      const customOnly = updated.filter((r) => r.isNew);
      localStorage.setItem(`service_reviews_${serviceId}`, JSON.stringify(customOnly));
    } catch {
      // ignore
    }

    setReviewName('');
    setReviewComment('');
    setReviewRating(5);
    setReviewSubmitted(true);
    setTimeout(() => setReviewSubmitted(false), 5000);
  };

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

  const renderPrimaryBookingCard = (cardRef = null) => (
    <div
      ref={cardRef}
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
    >
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

        {/* Gas Refill Notice if applicable */}
        {(serviceId === '6' || String(service?.name).toLowerCase().includes('gas') || String(service?.nameAr).includes('غاز') || String(service?.nameAr).includes('فريون')) && (
          <div className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/90 p-2.5 text-[11px] font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            <span className="font-bold">{language === 'ar' ? 'ملاحظة تعبئة الفريون:' : 'AC Gas Refill Notice:'}</span>{' '}
            <span>
              {language === 'ar'
                ? 'يبدأ من 180 ريال، وتختلف القيمة حسب نوع الغاز (R410A / R22) وكمية الشحن المطلوبة بعد فحص الضغوط.'
                : 'Starting from 180 SAR; final price varies depending on refrigerant type (R410A / R22) and required gas quantity.'}
            </span>
          </div>
        )}

        {/* Pricing Terms, VAT & Inspection Disclaimer */}
        <div className="mt-3 space-y-1.5 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-[11px] font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
          <p className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>{t.vatIncluded || (language === 'ar' ? 'الأسعار شاملة ضريبة القيمة المضافة 15%' : 'Prices include 15% VAT')}</span>
          </p>
          <p className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
            <span>{t.sparePartsNotIncluded || (language === 'ar' ? 'قطع الغيار غير مشمولة (تُسعر بشكل منفصل عند الحاجة)' : 'Spare parts not included (quoted separately)')}</span>
          </p>
          <p className="pt-1.5 text-[11px] font-bold text-primary dark:text-blue-400 border-t border-blue-100/70 dark:border-slate-700/70">
            {t.pricesVaryInspection || (language === 'ar' ? 'الأسعار تبدأ من وتختلف حسب المعاينة والفحص الميداني.' : 'Prices start from and may vary after inspection.')}
          </p>
        </div>
      </div>

      {/* Service Specs summary */}
      <div className="space-y-3 py-5 text-xs font-bold">
        <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
          <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            {language === 'ar' ? 'قطع الغيار:' : 'Spare Parts:'}
          </span>
          <span className="font-bold text-slate-800 dark:text-slate-200">
            {language === 'ar' ? 'أصلية معتمدة' : '100% Genuine'}
          </span>
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
          <span>{language === 'ar' ? 'المملكة العربية السعودية' : 'Saudi Arabia'}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3 pt-2">
        {/* Primary CTA: Book Now */}
        <button
          type="button"
          onClick={handleBook}
          className="group relative flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-sm font-black text-white shadow-md shadow-primary/25 transition-all hover:bg-primary-dark hover:shadow-lg hover:shadow-primary/30 active:scale-98 cursor-pointer"
        >
          <span>{t.bookNow}</span>
        </button>

        {/* Secondary CTA: WhatsApp */}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-xs sm:text-sm font-black text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-98"
        >
          <svg className="h-4.5 w-4.5 fill-current" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
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
  );

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

  return (
    <div className="min-h-screen bg-bg pb-28 lg:pb-16 dark:bg-slate-950" dir={isRTL ? 'rtl' : 'ltr'}>
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
              <div className="relative h-80 sm:h-[420px] lg:h-[515px] xl:h-[520px] w-full overflow-hidden">
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
              <div className="grid grid-cols-4 divide-x divide-slate-100 border-t border-slate-100 bg-slate-50/70 p-2 sm:p-4 rtl:divide-x-reverse dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="p-1 sm:p-2 text-center min-w-0">
                  <span className="block text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                    {t.startingFrom || 'Starting from'}
                  </span>
                  <span className="text-xs sm:text-base lg:text-lg font-bold text-primary dark:text-blue-400 truncate block">
                    {formatPrice(price)}
                  </span>
                </div>
                <div className="p-1 sm:p-2 text-center min-w-0">
                  <span className="block text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                    {language === 'ar' ? 'قطع الغيار' : 'Spare Parts'}
                  </span>
                  <span className="text-[11px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 truncate block">
                    {language === 'ar' ? 'أصلية معتمدة' : '100% Genuine'}
                  </span>
                </div>
                <div className="p-1 sm:p-2 text-center min-w-0">
                  <span className="block text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                    {language === 'ar' ? 'الضمان' : 'Warranty'}
                  </span>
                  <span className="text-[11px] sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 truncate block">
                    {language === 'ar' ? 'شامل ومعتمد' : '100% Certified'}
                  </span>
                </div>
                <div className="p-1 sm:p-2 text-center min-w-0">
                  <span className="block text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                    {language === 'ar' ? 'نوع الخدمة' : 'Service'}
                  </span>
                  <span className="text-[11px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 truncate block">
                    {language === 'ar' ? 'خدمة منزلية' : 'Doorstep Visit'}
                  </span>
                </div>
              </div>
            </div>

            {/* ═══ MOBILE PRIMARY BOOKING CARD (Image 2) ═══ */}
            <div className="lg:hidden">
              {renderPrimaryBookingCard(mobileBookingCardRef)}
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

            {/* 4-STEP REPAIR PROCESS */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-6 flex items-center gap-3">
                <div className="h-6 w-1 rounded-full bg-primary" />
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
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
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
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

            {/* ═══ 7. CUSTOMER REVIEWS & COMMENTS SECTION ═══ */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="h-6 w-1 rounded-full bg-primary" />
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                      {language === 'ar' ? 'آراء وتقييمات العملاء' : 'Customer Reviews & Comments'}
                    </h2>
                  </div>
                  <p className="mt-1 text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
                    {language === 'ar'
                      ? 'جميع التقييمات من عملاء حقيقيين تم إنجاز الخدمة في منازلهم بجدة ومكة المكرمة'
                      : 'Real reviews from verified households serviced in Jeddah & Makkah'}
                  </p>
                </div>

                {/* Score badge */}
                <div className="flex items-center gap-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 p-3.5 self-start sm:self-auto shrink-0">
                  <div className="text-center">
                    <span className="block text-2xl font-black text-slate-900 dark:text-white leading-none">
                      4.9
                    </span>
                    <div className="flex items-center justify-center gap-0.5 mt-1 text-amber-400">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-amber-400" />
                      ))}
                    </div>
                  </div>
                  <div className="text-start border-s border-amber-200 dark:border-amber-800 ps-3">
                    <span className="block text-xs font-black text-slate-800 dark:text-slate-200">
                      {language === 'ar' ? 'تقييم ممتاز' : 'Exceptional'}
                    </span>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      {reviewsList.length + 124} {language === 'ar' ? 'تقييم موثق' : 'verified reviews'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Add Review / Comment Form */}
              <div className="mt-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="h-4 w-4 text-primary dark:text-blue-400" />
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">
                    {language === 'ar' ? 'أضف تقييمك وتعليقك' : 'Leave a Review & Comment'}
                  </h4>
                </div>

                {reviewSubmitted && (
                  <div className="mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3 text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>
                      {language === 'ar'
                        ? 'شكراً لك! تم نشر تقييمك وتعليقك بنجاح.'
                        : 'Thank you! Your review has been submitted and published successfully.'}
                    </span>
                  </div>
                )}

                <form onSubmit={handleSubmitReview} className="space-y-4">
                  {/* Rating Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      {language === 'ar' ? 'تقييمك للخدمة:' : 'Your Rating:'}
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => {
                          const active = (reviewHoverRating || reviewRating) >= star;
                          return (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setReviewRating(star)}
                              onMouseEnter={() => setReviewHoverRating(star)}
                              onMouseLeave={() => setReviewHoverRating(0)}
                              className="p-1 transition-transform hover:scale-110 active:scale-95 focus:outline-none cursor-pointer"
                              aria-label={`Rate ${star} star`}
                            >
                              <Star
                                className={`h-6 w-6 ${
                                  active
                                    ? 'fill-amber-400 text-amber-400 drop-shadow-[0_2px_6px_rgba(251,191,36,0.3)]'
                                    : 'text-slate-300 dark:text-slate-600'
                                }`}
                              />
                            </button>
                          );
                        })}
                      </div>
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400 ms-1">
                        {reviewRating === 5 && (language === 'ar' ? 'ممتاز جداً (5/5)' : 'Excellent (5/5)')}
                        {reviewRating === 4 && (language === 'ar' ? 'جيد جداً (4/5)' : 'Very Good (4/5)')}
                        {reviewRating === 3 && (language === 'ar' ? 'جيد (3/5)' : 'Good (3/5)')}
                        {reviewRating <= 2 && (language === 'ar' ? 'مقبول (2/5)' : 'Fair (2/5)')}
                      </span>
                    </div>
                  </div>

                  {/* Name and City */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        {language === 'ar' ? 'الاسم الكامل:' : 'Your Name:'}
                      </label>
                      <input
                        type="text"
                        required
                        value={reviewName}
                        onChange={(e) => setReviewName(e.target.value)}
                        placeholder={language === 'ar' ? 'مثال: محمد العمري' : 'e.g. Mohammed Al-Amri'}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        {language === 'ar' ? 'المدينة:' : 'City:'}
                      </label>
                      <select
                        value={reviewCity}
                        onChange={(e) => setReviewCity(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-900 dark:text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="جدة">{language === 'ar' ? 'جدة' : 'Jeddah'}</option>
                        <option value="مكة المكرمة">{language === 'ar' ? 'مكة المكرمة' : 'Makkah'}</option>
                      </select>
                    </div>
                  </div>

                  {/* Comment Textarea */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {language === 'ar' ? 'تعليقك وتجربتك:' : 'Your Comment & Experience:'}
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder={
                        language === 'ar'
                          ? 'اكتب تعليقك حول دقة الموعد، جودة الفحص والإصلاح، والتعامل مع الفني...'
                          : 'Share your thoughts about technician arrival, diagnosis, and repair quality...'
                      }
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-black text-white shadow-md shadow-primary/25 hover:bg-primary-dark transition active:scale-95 cursor-pointer"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>{language === 'ar' ? 'نشر التقييم والتعليق' : 'Post Review & Comment'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Reviews List */}
              <div className="mt-8 space-y-4">
                {reviewsList.map((rev) => {
                  const isLiked = !!likedReviews[rev.id];
                  const currentLikes = (rev.likes || 0) + (isLiked ? 1 : 0);
                  const displayName = language === 'ar' ? rev.name : (rev.nameEn || rev.name);
                  const displayCity = language === 'ar' ? rev.city : (rev.cityEn || rev.city);
                  const displayDate = language === 'ar' ? rev.date : (rev.dateEn || rev.date);
                  const displayComment = language === 'ar' ? rev.comment : (rev.commentEn || rev.comment);

                  return (
                    <div
                      key={rev.id}
                      className="rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-800/40 p-5 transition hover:border-slate-200 dark:hover:border-slate-700"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {/* Avatar Initials */}
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-blue-600 text-xs font-black text-white shadow-sm">
                            {displayName
                              ?.split(' ')
                              .map((w) => w[0])
                              .slice(0, 2)
                              .join('')}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h5 className="text-sm font-black text-slate-900 dark:text-white">
                                {displayName}
                              </h5>
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                <span>{language === 'ar' ? 'عميل موثق' : 'Verified Customer'}</span>
                              </span>
                            </div>
                            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                              📍 {displayCity} • {displayDate}
                            </p>
                          </div>
                        </div>

                        {/* Stars */}
                        <div className="flex items-center gap-0.5 text-amber-400">
                          {[...Array(rev.rating || 5)].map((_, i) => (
                            <Star key={i} className="h-3.5 w-3.5 fill-amber-400" />
                          ))}
                        </div>
                      </div>

                      {/* Comment text */}
                      <p className="mt-3 text-xs sm:text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-300">
                        {displayComment}
                      </p>

                      {/* Helpful Button */}
                      <div className="mt-3.5 flex items-center justify-between border-t border-slate-200/50 dark:border-slate-700/50 pt-3 text-xs">
                        <button
                          type="button"
                          onClick={() => handleToggleLike(rev.id)}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                            isLiked
                              ? 'bg-blue-50 text-primary dark:bg-blue-950/50 dark:text-blue-300'
                              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                          }`}
                        >
                          <ThumbsUp className={`h-3.5 w-3.5 ${isLiked ? 'fill-current' : ''}`} />
                          <span>{language === 'ar' ? 'مفيد' : 'Helpful'} ({currentLikes})</span>
                        </button>

                        <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                          {language === 'ar' ? 'تجربة حقيقية مؤكدة' : 'Confirmed experience'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (5 COLS - STICKY BOOKING CARD) */}
          <div className="lg:col-span-5 xl:col-span-4">
            <div className="sticky top-24 space-y-6">
              {/* PRIMARY ACTION CARD (DESKTOP) */}
              <div className="hidden lg:block">
                {renderPrimaryBookingCard()}
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
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  {t.relatedServices || 'Related Services'}
                </h2>
              </div>
              <Link
                href="/services"
                className="text-xs sm:text-sm font-bold text-primary hover:text-primary-dark transition"
              >
                {t.seeAll || 'View All'}
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

      {/* ═══ SCROLL TO TOP ARROW BUTTON ═══ */}
      <button
        onClick={scrollToTop}
        className={`fixed z-40 flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-primary dark:text-blue-400 shadow-xl shadow-slate-900/15 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all duration-300 active:scale-95 cursor-pointer ${
          showStickyBar ? 'bottom-20 lg:bottom-8' : 'bottom-6 lg:bottom-8'
        } ${isRTL ? 'left-4 sm:left-6' : 'right-4 sm:right-6'} ${
          showScrollTop
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        aria-label={language === 'ar' ? 'العودة إلى الأعلى' : 'Back to top'}
        title={language === 'ar' ? 'العودة إلى الأعلى' : 'Back to top'}
      >
        <ArrowUp className="h-5 w-5" />
      </button>

      {/* ═══ FIXED FLOATING MOBILE BAR (Shows only when booking card is scrolled out of view) ═══ */}
      <div
        className={`lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 p-3 shadow-2xl safe-area-pb transition-all duration-300 ${
          showStickyBar
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="mx-auto max-w-lg flex items-center gap-2">
          <div className="shrink-0 px-2 text-start">
            <span className="block text-[10px] font-bold uppercase text-slate-400">
              {t.startingFrom || 'From'}
            </span>
            <span className="text-base font-black text-primary dark:text-blue-400">
              {formatPrice(price)}
            </span>
            <span className="block text-[9px] font-semibold text-slate-400 dark:text-slate-500 truncate">
              {language === 'ar' ? 'شامل الضريبة 15%' : 'Incl. 15% VAT'}
            </span>
          </div>

          <button
            type="button"
            onClick={handleBook}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary hover:bg-primary-dark py-3 px-3 text-xs sm:text-sm font-black text-white shadow-md shadow-primary/25 active:scale-95 transition-all cursor-pointer"
          >
            <span>{t.bookNow}</span>
          </button>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all active:scale-95"
            aria-label="WhatsApp"
          >
            <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </a>

          <a
            href="tel:+966590192146"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-primary dark:text-blue-400 shadow-sm transition-all active:scale-95"
            aria-label="Call"
          >
            <Phone className="h-4.5 w-4.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
