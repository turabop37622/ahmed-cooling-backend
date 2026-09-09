'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Snowflake,
  Phone,
  Star,
  ChevronRight,
  Shield,
  Zap,
  DollarSign,
  BadgeCheck,
  MapPin,
  AlertTriangle,
  Clock,
  Wrench,
  CheckCircle2,
  Award,
  Sparkles,
  MessageSquare,
  ArrowRight,
  ArrowLeft,
  HelpCircle,
  UserCheck,
  Check,
} from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';
import { useAuth } from '../contexts/AuthContext';
import { getServices, getPublicReviews } from '../lib/api';
import ServiceCard from '../components/ServiceCard';

const SERVICES_FALLBACK = [
  {
    _id: '1',
    icon: '❄️',
    name: 'AC Repair',
    nameAr: 'إصلاح وصيانة المكيفات',
    description: 'Expert diagnostics and repair for all split, window, and central AC systems. We fix cooling faults, gas leaks, and noisy units.',
    descriptionAr: 'تشخيص وإصلاح احترافي لجميع مكيفات الاسبليت والشباك والمركزي. صيانة ضعف التبريد وتسريب الفريون والأعطال الكهربائية.',
    basePrice: 150,
    estimatedDuration: '1-2 hours',
    isPopular: true,
    category: 'ac',
    warrantyDays: 30,
  },
  {
    _id: '2',
    icon: '🔧',
    name: 'AC Installation',
    nameAr: 'تركيب مكيفات سبليت وشباك',
    description: 'Professional split & window AC mounting, vacuum test, and leak-free copper piping done by certified technicians.',
    descriptionAr: 'فك وتركيب احترافي للمكيفات الجديدة والمنقولة مع فحص التفريغ وتمديد مواسير النحاس بأعلى معايير الأمان.',
    basePrice: 200,
    estimatedDuration: '2-3 hours',
    isPopular: true,
    category: 'ac',
    warrantyDays: 30,
  },
  {
    _id: '3',
    icon: '🧹',
    name: 'AC Deep Cleaning',
    nameAr: 'غسيل وتنظيف عميق للمكيفات',
    description: 'Complete high-pressure jet wash, antimicrobial coil sanitization, and drain clearing for maximum airflow & health.',
    descriptionAr: 'غسيل بأجهزة الضغط العالي ومواد التعقيم للمبخر والمروحة ومجرى التصريف لضمان هواء نقي وتبريد قوي.',
    basePrice: 100,
    estimatedDuration: '1-2 hours',
    isPopular: true,
    category: 'ac',
    warrantyDays: 30,
  },
  {
    _id: '4',
    icon: '🧊',
    name: 'Refrigerator Repair',
    nameAr: 'صيانة وإصلاح الثلاجات',
    description: 'All refrigerator brands: compressor replacement, defrost timer fixes, thermostat calibration, and genuine gas refill.',
    descriptionAr: 'صيانة متخصصة لجميع ماركات الثلاجات والفريزر. تغيير الثرموستات والكمبروسر ومعالجة تسريب الفريون والثلج.',
    basePrice: 150,
    estimatedDuration: '1-2 hours',
    isPopular: true,
    category: 'refrigerator',
    warrantyDays: 30,
  },
  {
    _id: '5',
    icon: '🧺',
    name: 'Washing Machine Repair',
    nameAr: 'إصلاح وصيانة الغسالات',
    description: 'Expert repair for front-load and top-load washers: motor issues, water drainage, noisy bearings, and electronic PCB boards.',
    descriptionAr: 'إصلاح جميع أنواع الغسالات الأوتوماتيك والعادية: مشاكل دوران الحوض، طرد المياه، اهتزاز التجفيف ولوحات التحكم.',
    basePrice: 140,
    estimatedDuration: '1-2 hours',
    isPopular: true,
    category: 'washing-machine',
    warrantyDays: 30,
  },
  {
    _id: '6',
    icon: '🔥',
    name: 'Stove & Oven Repair',
    nameAr: 'صيانة الأفران والبوتاجازات',
    description: 'Precision repair for gas & electric cookers, burner ignition problems, uneven baking temperatures, and safety valves.',
    descriptionAr: 'إصلاح أفران الغاز والكهرباء والبلت إن: تسليك العيون، ضبط درجات الحرارة، تبديل المفاتيح ومستشعرات الأمان.',
    basePrice: 130,
    estimatedDuration: '1-2 hours',
    category: 'stove',
    warrantyDays: 30,
  },
  {
    _id: '7',
    icon: '💨',
    name: 'AC Gas Refill',
    nameAr: 'شحن فريون أصلي للمكيف',
    description: 'Top-tier R410A and R22 refrigerant charging with pressure leak test and compressor performance check.',
    descriptionAr: 'شحن غاز فريون أصلي أمريكي مع كشف تسريبات الضغط وفحص أداء الكمبروسر وضمان التبريد التام.',
    basePrice: 180,
    estimatedDuration: '1 hour',
    category: 'ac',
    isEmergency: true,
    warrantyDays: 30,
  },
  {
    _id: '8',
    icon: '⚡',
    name: 'Electrical Wiring Fix',
    nameAr: 'صيانة التمديدات والأعطال الكهربائية',
    description: 'Distribution board breaker repairs, short circuit troubleshooting, appliance power sockets, and load balancing.',
    descriptionAr: 'فحص وإصلاح القواطع الكهربائية، كشف الماس الكهربائي، وتأمين دوائر التكييف والأجهزة المنزلية.',
    basePrice: 120,
    estimatedDuration: '1-2 hours',
    category: 'general',
    warrantyDays: 30,
  },
  {
    _id: '9',
    icon: '🏢',
    name: 'Central AC Service',
    nameAr: 'صيانة التكييف المركزي والدكت',
    description: 'Commercial and residential central HVAC chiller maintenance, duct cleaning, thermostat automation, and airflow balancing.',
    descriptionAr: 'صيانة دورية للمباني والفلل وأنظمة التكييف المركزي والمخفي والدكت مع فحص ضواغط التبريد وفلاتر الهواء.',
    basePrice: 350,
    estimatedDuration: '2-4 hours',
    category: 'ac',
    isPopular: true,
    warrantyDays: 30,
  },
];

const BRANDS = [
  'LG', 'Samsung', 'Daikin', 'Gree', 'Carrier', 'Midea',
  'York', 'O General', 'Hitachi', 'Panasonic', 'Bosch',
  'Whirlpool', 'Ariston', 'Super General', 'Zamil', 'Toshiba',
];

const REVIEWS_EN = [
  { name: 'Ahmed Al-Harbi', city: 'Jeddah', rating: 5, text: 'Excellent AC repair service! The technician came on time and fixed the AC within an hour. Highly recommended!', timeAgo: '2 days ago' },
  { name: 'Fatima Al-Zahrani', city: 'Makkah', rating: 5, text: 'Professional and fast service. They installed my new split AC perfectly. Very happy with the work!', timeAgo: '3 days ago' },
  { name: 'Mohammed Al-Ghamdi', city: 'Jeddah', rating: 5, text: 'Called them for an emergency fridge repair at night. Technician arrived in 30 minutes. Amazing service!', timeAgo: '5 days ago' },
  { name: 'Sara Al-Otaibi', city: 'Makkah', rating: 4, text: 'Good washing machine repair. The technician was knowledgeable and fixed the issue quickly. Fair prices.', timeAgo: '1 week ago' },
  { name: 'Khalid Al-Shehri', city: 'Jeddah', rating: 5, text: 'Best AC deep cleaning service! My AC is running like new now. Will definitely use again.', timeAgo: '1 week ago' },
  { name: 'Noura Al-Qahtani', city: 'Makkah', rating: 5, text: 'Very reliable company. They repaired my oven and microwave on the same visit. Great value!', timeAgo: '2 weeks ago' },
  { name: 'Omar Al-Dossari', city: 'Jeddah', rating: 5, text: 'Annual maintenance plan is worth it! They service all appliances regularly. Excellent team.', timeAgo: '2 weeks ago' },
  { name: 'Huda Al-Malki', city: 'Makkah', rating: 4, text: 'Freezer was leaking and they fixed it same day. Technician was very professional. Recommended!', timeAgo: '3 weeks ago' },
  { name: 'Yusuf Al-Rashidi', city: 'Jeddah', rating: 5, text: 'Called for electrical wiring fix. Fast response, clean work, and very affordable pricing.', timeAgo: '3 weeks ago' },
  { name: 'Maryam Al-Subaie', city: 'Makkah', rating: 5, text: 'They repaired my central AC system for the entire building. Professional and experienced team!', timeAgo: '1 month ago' },
];

const REVIEWS_AR = [
  { name: 'أحمد الحربي', city: 'جدة', rating: 5, text: 'خدمة إصلاح مكيفات ممتازة! جاء الفني في الوقت المحدد وأصلح المكيف خلال ساعة. أنصح بشدة!', timeAgo: 'منذ يومين' },
  { name: 'فاطمة الزهراني', city: 'مكة', rating: 5, text: 'خدمة احترافية وسريعة. ركبوا مكيف سبليت جديد بشكل مثالي. سعيدة جداً بالعمل!', timeAgo: 'منذ ٣ أيام' },
  { name: 'محمد الغامدي', city: 'جدة', rating: 5, text: 'اتصلت بهم لإصلاح ثلاجة طارئ بالليل. وصل الفني خلال ٣٠ دقيقة. خدمة مذهلة!', timeAgo: 'منذ ٥ أيام' },
  { name: 'سارة العتيبي', city: 'مكة', rating: 4, text: 'إصلاح غسالة جيد. الفني كان متخصص وأصلح المشكلة بسرعة. أسعار معقولة.', timeAgo: 'منذ أسبوع' },
  { name: 'خالد الشهري', city: 'جدة', rating: 5, text: 'أفضل خدمة تنظيف مكيفات! المكيف يعمل كالجديد الآن. سأستخدمهم مرة أخرى بالتأكيد.', timeAgo: 'منذ أسبوع' },
  { name: 'نورة القحطاني', city: 'مكة', rating: 5, text: 'شركة موثوقة جداً. أصلحوا الفرن والميكروويف في نفس الزيارة. قيمة ممتازة!', timeAgo: 'منذ أسبوعين' },
  { name: 'عمر الدوسري', city: 'جدة', rating: 5, text: 'خطة الصيانة السنوية تستحق! يصيانون جميع الأجهزة بانتظام. فريق ممتاز.', timeAgo: 'منذ أسبوعين' },
  { name: 'هدى المالكي', city: 'مكة', rating: 4, text: 'الفريزر كان يسرب ماء وأصلحوه في نفس اليوم. الفني كان محترف جداً. أنصح بهم!', timeAgo: 'منذ ٣ أسابيع' },
  { name: 'يوسف الرشيدي', city: 'جدة', rating: 5, text: 'اتصلت لإصلاح الأسلاك الكهربائية. استجابة سريعة، عمل نظيف، وأسعار معقولة.', timeAgo: 'منذ ٣ أسابيع' },
  { name: 'مريم السبيعي', city: 'مكة', rating: 5, text: 'أصلحوا نظام التكييف المركزي للمبنى بالكامل. فريق محترف وذو خبرة!', timeAgo: 'منذ شهر' },
];

const HOME_FAQS = [
  {
    qEn: 'How fast can a technician reach my home in Jeddah or Makkah?',
    qAr: 'ما هي سرعة وصول الفني إلى منزلي في جدة أو مكة؟',
    aEn: 'For regular bookings, you can pick any convenient 2-hour window today. For emergency breakdowns (leakage, AC failure in summer), our mobile response team reaches you within 60 to 90 minutes.',
    aAr: 'للحجوزات العادية يمكنك اختيار الموعد المناسب لك اليوم. وللطوارئ الحادة (توقف التكييف بالصيف، تسريب مياه) يصل فريقنا المتنقل خلال ٦٠ إلى ٩٠ دقيقة.',
  },
  {
    qEn: 'Do you charge a visit fee if no repair is performed?',
    qAr: 'هل هناك رسوم كشف وزيارة؟',
    aEn: 'Our standard diagnostic visit fee is SAR 150, which covers full system troubleshooting and a written quote. If you proceed with the repair with us, the visit fee is adjusted into your total bill!',
    aAr: 'رسوم الفحص والكشف الشامل ١٥٠ ريالاً تشمل التشخيص وتقديم التكلفة المحددة. وعند الموافقة على الإصلاح يتم خصم رسوم الكشف من إجمالي الفاتورة!',
  },
  {
    qEn: 'What is included in the service warranty?',
    qAr: 'ما الذي يشمله الضمان المعتمد؟',
    aEn: 'All labor and parts replaced by our team are protected with our official certified warranty. If any issue reoccurs, we send a senior technician to re-inspect and fix it completely free of charge.',
    aAr: 'جميع أعمال الصيانة وقطع الغيار الموردة مشمولة بضمان رسمي ومعتمد. وإذا تكرر أي عطل يتم إرسال فني متخصص لإعادة الفحص والإصلاح مجاناً بالكامل.',
  },
  {
    qEn: 'Which payment methods do you accept?',
    qAr: 'ما هي طرق الدفع المتاحة لديكم؟',
    aEn: 'You pay only after the repair is completed and tested. We accept Mada, Visa, MasterCard, Apple Pay, Cash, and instant bank transfer.',
    aAr: 'الدفع يتم فقط بعد إتمام الصيانة وفحص كفاءة الجهاز. نقبل بطاقات مدى، فيزا، ماستركارد، آبل باي، والدفع النقدي والتحويل البنكي.',
  },
];

const JEDDAH_AREAS = [
  'الروضة (Al Rawdah)', 'الصفا (Al Safa)', 'الزهراء (Al Zahra)', 'الحمراء (Al Hamra)',
  'الأندلس (Al Andalus)', 'السلامة (Al Salamah)', 'المروة (Al Marwah)', 'أبحر الشمالية (Abhur)',
  'البوادي (Al Bawadi)', 'الفيصلية (Al Faisaliyyah)', 'المحمدية (Al Muhammadiyah)', 'النعيم (Al Naim)',
];

const MAKKAH_AREAS = [
  'العوالي (Al Awali)', 'العزيزية (Al Aziziyah)', 'النسيم (Al Naseem)', 'الشوقية (Al Shoqiyah)',
  'الرصيفة (Al Rusayfah)', 'كدي (Kudai)', 'التنعيم (Al Taneem)', 'الهنداوية (Al Hindawiyyah)',
];

export default function Home() {
  const router = useRouter();
  const { t, language, isRTL, formatPrice } = useTranslation();
  const { user } = useAuth();
  const [services, setServices] = useState(SERVICES_FALLBACK);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  const PHONE = '+966590192146';

  useEffect(() => {
    loadData();
  }, [language]);

  const loadData = async () => {
    try {
      const svcRes = await getServices();
      const svcList = svcRes?.services || svcRes?.data || svcRes;
      if (Array.isArray(svcList) && svcList.length) {
        setServices(svcList);
      } else {
        setServices(SERVICES_FALLBACK);
      }
    } catch {
      setServices(SERVICES_FALLBACK);
    }

    const fallback = language === 'ar' ? REVIEWS_AR : REVIEWS_EN;
    try {
      const revRes = await getPublicReviews();
      const apiReviews = (revRes?.reviews || revRes?.data || []).filter(
        (r) => r.rating && r.name,
      );
      if (apiReviews.length) {
        const combined = [...apiReviews, ...fallback];
        const unique = combined.filter(
          (r, i, arr) => arr.findIndex((x) => x.name === r.name && x.text === r.text) === i,
        );
        setReviews(unique);
      } else {
        setReviews(fallback);
      }
    } catch {
      setReviews(fallback);
    }

    setLoading(false);
  };

  const handleBook = (service) => {
    router.push(`/book/${service._id || service.id}`);
  };

  const handleEmergency = () => {
    window.location.href = `tel:${PHONE}`;
  };

  const handleRateClick = (e) => {
    e.preventDefault();
    if (!user) {
      router.push('/login');
    } else {
      router.push('/rate');
    }
  };

  // Filtered services for home page
  const filteredServices = useMemo(() => {
    if (activeTab === 'all') return services;
    if (activeTab === 'popular') return services.filter((s) => s.isPopular || s.popular);
    if (activeTab === 'emergency') return services.filter((s) => s.isEmergency || s.emergency);
    return services.filter((s) => {
      const cat = String(s.category || '').toLowerCase();
      if (activeTab === 'ac') return cat.includes('ac');
      if (activeTab === 'refrigerator') return cat.includes('refrigerator') || cat.includes('fridge');
      if (activeTab === 'washing') return cat.includes('wash') || cat.includes('washer');
      if (activeTab === 'stove') return cat.includes('stove') || cat.includes('oven');
      return true;
    });
  }, [services, activeTab]);

  const howSteps = [
    {
      step: '01',
      title: language === 'ar' ? 'حدد الخدمة والموعد' : 'Choose Service & Time',
      desc: language === 'ar' ? 'اختر نوع الجهاز والمشكلة وحدد الوقت المناسب لك في دقيقة واحدة.' : 'Pick your appliance service and convenient time slot in 60 seconds.',
    },
    {
      step: '02',
      title: language === 'ar' ? 'وصول الفني المتخصص' : 'Certified Tech Arrives',
      desc: language === 'ar' ? 'يصلك فني معتمد مجهز بجميع أجهزة الفحص المتقدمة وقطع الغيار.' : 'Our vetted technician arrives with advanced diagnostic tools & parts.',
    },
    {
      step: '03',
      title: language === 'ar' ? 'تسعير شفاف وإصلاح دقيق' : 'Upfront Quote & Fix',
      desc: language === 'ar' ? 'شرح سبب العطل وتكلفة واضحة مسبقة بدون أي مصاريف خفية.' : 'Clear explanation of root cause and transparent price before repair starts.',
    },
    {
      step: '04',
      title: language === 'ar' ? 'فحص تشغيل وضمان معتمد' : 'Testing & Certified Warranty',
      desc: language === 'ar' ? 'اختبار كفاءة الجهاز بعد الصيانة مع سند ضمان رسمي ومعتمد.' : 'Post-repair cooling performance test with an official certified warranty receipt.',
    },
  ];

  const whyItems = [
    {
      icon: <Shield className="h-7 w-7 text-primary" />,
      title: language === 'ar' ? 'ضمان صيانة رسمي ومعتمد' : 'Official Certified Warranty',
      desc: language === 'ar' ? 'سند ضمان معتمد يضمن حقك الكامل في حال تكرار أي عطل مجاناً.' : 'Complete protection covering labor and parts with 100% free revisit policy.',
    },
    {
      icon: <Zap className="h-7 w-7 text-emerald-600" />,
      title: language === 'ar' ? 'وصول سريع خلال ٦٠-٩٠ دقيقة' : 'Rapid Response in 60-90 Mins',
      desc: language === 'ar' ? 'أسطول فنيين متنقل وموزع في جميع أحياء جدة ومكة المكرمة.' : 'Distributed technician fleet ready to reach your home across Jeddah & Makkah.',
    },
    {
      icon: <UserCheck className="h-7 w-7 text-purple-600" />,
      title: language === 'ar' ? 'فنيون محترفون ومعتمدون' : 'Certified & Background-Checked',
      desc: language === 'ar' ? 'فريق مدرب بخبرة تتجاوز ١٠ سنوات في صيانة المكيفات والأجهزة المنزلية.' : 'Skilled specialists with 10+ years of dedicated appliance experience.',
    },
    {
      icon: <DollarSign className="h-7 w-7 text-amber-600" />,
      title: language === 'ar' ? 'تسعير واضح - الدفع بعد الفحص' : 'Pay After Work Is Completed',
      desc: language === 'ar' ? 'لا تدفع أي مبلغ حتى يتم إصلاح جهازك واختباره وتأكدك من التبريد التام.' : 'No upfront payment. Inspect and test your appliance before you pay a single riyal.',
    },
    {
      icon: <Award className="h-7 w-7 text-blue-600" />,
      title: language === 'ar' ? 'قطع غيار أصلية ١٠٠٪' : '100% Genuine Spare Parts',
      desc: language === 'ar' ? 'نستخدم قطع غيار وكالة مطابقة للمواصفات القياسية لضمان عمر أطول للجهاز.' : 'Manufacturer-approved replacement components for optimal lifespan and efficiency.',
    },
    {
      icon: <Clock className="h-7 w-7 text-red-600" />,
      title: language === 'ar' ? 'طوارئ ٢٤/٧ على مدار الساعة' : '24/7 Emergency Support',
      desc: language === 'ar' ? 'جاهزون دائماً لخدمتك في فترات الصيف الحار وعطلات نهاية الأسبوع.' : 'Always on standby for severe summer heatwaves and weekend emergencies.',
    },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-bg dark:bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm font-semibold text-sub">{t.loadingServices}</p>
      </div>
    );
  }

  return (
    <div className="bg-bg dark:bg-slate-950" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* ═══ 1. HERO SECTION (CONTAINER MATCHING USER MARKERS: mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8) ═══ */}
      <section className="relative min-h-[85vh] overflow-hidden bg-gradient-to-br from-[#1D4ED8] via-[#2563EB] to-[#3B82F6] flex items-center">
        {/* Background Video */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src="/hero.mp4" type="video/mp4" />
        </video>

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0F172A]/85 via-[#1D4ED8]/65 to-[#2563EB]/40" />

        <div className="relative mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8 py-20 sm:py-28 w-full">
          <div className="max-w-3xl">
            {/* Top Badge */}
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-4 py-1.5 backdrop-blur-md shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-black text-white">{t.heroAvailable}</span>
            </div>

            <h1 className="text-4xl font-black leading-[1.15] tracking-tight text-white sm:text-6xl lg:text-7xl">
              {(t.heroTitle || '').split('\n').map((line, i) => (
                <span key={i}>
                  {i === 0 ? line : <><br /><span className="text-blue-200">{line}</span></>}
                </span>
              ))}
            </h1>

            <p className="mt-6 max-w-2xl text-base font-medium leading-relaxed text-white/85 sm:text-xl">
              {t.heroSubtitle}
            </p>

            {/* CTA Buttons */}
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/services"
                className="group inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-sm sm:text-base font-black text-primary shadow-2xl transition-all hover:scale-105 hover:bg-blue-50"
              >
                <span>{t.ourServices}</span>
                {isRTL ? (
                  <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                ) : (
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                )}
              </Link>

              <button
                onClick={handleEmergency}
                className="inline-flex items-center gap-2 rounded-2xl border-2 border-white/30 bg-white/10 px-8 py-4 text-sm sm:text-base font-extrabold text-white backdrop-blur-md transition-all hover:bg-white/20 hover:border-white/50"
              >
                <Phone className="h-4 w-4 text-red-300" />
                <span>{t.heroEmergencyCta}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 2. KEY STATS IMPACT COUNTERS (mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8) ═══ */}
      <section className="relative z-10 -mt-8 mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <div className="text-center p-3 border-b sm:border-b-0 border-slate-100 dark:border-slate-800">
            <span className="text-2xl sm:text-4xl font-black text-primary dark:text-blue-400">10+</span>
            <p className="mt-1 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300">
              {language === 'ar' ? 'سنوات خبرة في المملكة' : 'Years Experience in KSA'}
            </p>
          </div>
          <div className="text-center p-3 border-b sm:border-b-0 border-slate-100 dark:border-slate-800">
            <span className="text-2xl sm:text-4xl font-black text-emerald-600 dark:text-emerald-400">2,500+</span>
            <p className="mt-1 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300">
              {language === 'ar' ? 'عميل راضٍ ومستمر' : 'Happy Homes Served'}
            </p>
          </div>
          <div className="text-center p-3">
            <span className="text-2xl sm:text-4xl font-black text-amber-500">100%</span>
            <p className="mt-1 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300">
              {language === 'ar' ? 'قطع غيار أصلية ومضمونة' : 'Genuine Parts Guarantee'}
            </p>
          </div>
          <div className="text-center p-3">
            <span className="text-2xl sm:text-4xl font-black text-purple-600 dark:text-purple-400">24/7</span>
            <p className="mt-1 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300">
              {language === 'ar' ? 'خدمة طوارئ واستجابة' : 'Emergency Assistance'}
            </p>
          </div>
        </div>
      </section>

      {/* ═══ 3. OUR SERVICES: 3 IN A ROW (mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8) ═══ */}
      <section className="mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8 pt-16 pb-12">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-1 rounded-full bg-primary" />
              <span className="text-xs font-black uppercase tracking-wider text-primary dark:text-blue-400">
                {language === 'ar' ? 'خدماتنا المعتمدة' : 'Verified Services'}
              </span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white">
              {t.ourServices}
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-400">
              {language === 'ar'
                ? 'اختر الخدمة للاطلاع على التفاصيل الكاملة أو الحجز الفوري في منزلك'
                : 'Browse our complete range of certified appliance repair & installation solutions'}
            </p>
          </div>

          <Link
            href="/services"
            className="inline-flex items-center gap-1.5 text-sm font-black text-primary hover:text-primary-dark transition-colors self-start sm:self-auto"
          >
            <span>{t.seeAll}</span>
            {isRTL ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          </Link>
        </div>

        {/* Category Tabs */}
        <div className="mb-8 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {[
            { id: 'all', label: language === 'ar' ? 'جميع الخدمات' : 'All Services' },
            { id: 'ac', label: language === 'ar' ? 'المكيفات' : 'Air Conditioning' },
            { id: 'refrigerator', label: language === 'ar' ? 'الثلاجات والفريزر' : 'Refrigerators' },
            { id: 'washing', label: language === 'ar' ? 'الغسالات' : 'Washing Machines' },
            { id: 'stove', label: language === 'ar' ? 'الأفران والبوتاجاز' : 'Stoves & Ovens' },
            { id: 'popular', label: language === 'ar' ? 'الأكثر طلباً' : 'Popular' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-2xl px-5 py-2.5 text-xs sm:text-sm font-black transition-all ${
                activeTab === tab.id
                  ? 'bg-primary text-white shadow-md shadow-primary/25'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 3 CARDS PER ROW, MATCHING max-w-[1560px] */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {filteredServices.slice(0, 9).map((svc) => (
            <ServiceCard
              key={svc._id || svc.name}
              service={svc}
              onBook={handleBook}
            />
          ))}
        </div>

        {/* Bottom Explorer CTA */}
        <div className="mt-12 text-center">
          <Link
            href="/services"
            className="inline-flex items-center gap-2 rounded-2xl border-2 border-primary/30 bg-primary-light px-8 py-4 text-sm font-black text-primary hover:bg-primary hover:text-white transition-all shadow-sm"
          >
            <span>{language === 'ar' ? 'عرض جميع الخدمات وقائمة الأسعار' : 'Explore All Services & Price List'}</span>
            {isRTL ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          </Link>
        </div>
      </section>

      {/* ═══ 4. BRANDS WE SERVICE (mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8) ═══ */}
      <section className="border-y border-slate-200/80 bg-white py-14 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block rounded-xl bg-blue-50 px-3 py-1 text-xs font-bold text-primary dark:bg-blue-950/60 dark:text-blue-300">
            {language === 'ar' ? 'وكالات وماركات معتمدة' : 'Factory-Grade Spare Parts'}
          </span>
          <h2 className="mt-2 text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
            {language === 'ar' ? 'نصلح جميع الماركات العالمية والمحلية' : 'Brands We Expertly Service & Repair'}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">
            {language === 'ar'
              ? 'نستخدم قطع غيار أصلية موثوقة ومطابقة لمواصفات الشركة المصنعة لضمان أفضل أداء لجهازك'
              : 'Our certified engineers are trained on all major international and GCC appliance brands'}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            {BRANDS.map((brand, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-5 py-3 text-xs sm:text-sm font-black text-slate-800 shadow-sm transition hover:border-primary/50 hover:bg-white hover:text-primary dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-200"
              >
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span>{brand}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 5. HOW IT WORKS (mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8) ═══ */}
      <section className="mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-xs font-black uppercase tracking-wider text-primary">
              {t.howItWorks}
            </span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white">
            {language === 'ar' ? 'كيف تتم خدمة الصيانة في ٤ خطوات؟' : 'How It Works In 4 Easy Steps'}
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {language === 'ar' ? 'تجربة حجز مريحة وشفافة من البداية وحتى استلام سند الضمان' : 'Smooth, transparent, and completely stress-free appliance repair'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {howSteps.map((item, i) => (
            <div
              key={i}
              className="relative flex flex-col rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-base font-black text-white shadow-md shadow-primary/20">
                  {item.step}
                </span>
                <span className="text-3xl font-black text-slate-100 dark:text-slate-800">
                  #{i + 1}
                </span>
              </div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {item.title}
              </h3>
              <p className="mt-2 text-xs sm:text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-400">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 6. SEASONAL MAINTENANCE & CARE PACKAGES (mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8) ═══ */}
      <section className="bg-slate-100/60 py-16 dark:bg-slate-900/50">
        <div className="mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="inline-block rounded-xl bg-blue-100 px-3 py-1 text-xs font-bold text-primary dark:bg-blue-900/40 dark:text-blue-300">
              {language === 'ar' ? 'باقات توفير العائلات' : 'Smart Care Packages'}
            </span>
            <h2 className="mt-2 text-2xl sm:text-4xl font-black text-slate-900 dark:text-white">
              {language === 'ar' ? 'باقات الصيانة الدورية والتنظيف' : 'Seasonal Maintenance & Care Plans'}
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {language === 'ar' ? 'وفر تكاليف الأعطال الكبيرة وحافظ على عمر أجهزتك وكفاءة التبريد' : 'Avoid costly sudden breakdowns with our proactive seasonal service packages'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Package 1 */}
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col">
              <span className="text-xs font-black uppercase text-slate-500">{language === 'ar' ? 'كشف وزيارة فردية' : 'Single Issue Visit'}</span>
              <h3 className="mt-1 text-xl font-black text-slate-900 dark:text-white">{language === 'ar' ? 'فحص وتشخيص عطل' : 'Diagnostic Repair Visit'}</h3>
              <div className="mt-4 mb-6">
                <span className="text-3xl font-black text-slate-900 dark:text-white">{formatPrice(150)}</span>
                <span className="text-xs text-slate-500 ms-1">{language === 'ar' ? '/ زيارة' : '/ visit'}</span>
              </div>
              <ul className="space-y-3 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-8 flex-1">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> {language === 'ar' ? 'فحص شامل للعطل بالمنزل' : 'Full on-site diagnostic'}</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> {language === 'ar' ? 'تسعير مسبق قبل البدء' : 'Upfront written quote'}</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> {language === 'ar' ? 'ضمان رسمي معتمد على العمل' : 'Official certified work warranty'}</li>
              </ul>
              <Link href="/book/pkg_diagnostic" className="block w-full rounded-2xl border border-slate-200 py-3.5 text-center text-xs font-black text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 transition">
                {language === 'ar' ? 'طلب زيارة كشف' : 'Book Diagnostic'}
              </Link>
            </div>

            {/* Package 2 - Featured */}
            <div className="relative rounded-3xl border-2 border-primary bg-white p-8 shadow-xl dark:bg-slate-900 flex flex-col">
              <span className="absolute -top-3.5 start-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-black text-white shadow-md">
                ★ {language === 'ar' ? 'الأكثر طلباً بالصيف' : 'Most Popular'}
              </span>
              <span className="text-xs font-black uppercase text-primary">{language === 'ar' ? 'باقة التبريد المثالي' : 'Summer AC Prep'}</span>
              <h3 className="mt-1 text-xl font-black text-slate-900 dark:text-white">{language === 'ar' ? 'غسيل عميق + شحن فريون' : 'Deep Wash + Gas Topup'}</h3>
              <div className="mt-4 mb-6">
                <span className="text-3xl font-black text-primary">{formatPrice(280)}</span>
                <span className="text-xs text-slate-500 ms-1">{language === 'ar' ? '/ مكيف' : '/ unit'}</span>
              </div>
              <ul className="space-y-3 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-8 flex-1">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> {language === 'ar' ? 'غسيل ضغط عالي للمبخر والمروحة' : 'High pressure coil & blower wash'}</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> {language === 'ar' ? 'شحن فحص ضغط غاز الفريون' : 'Refrigerant pressure top-up'}</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> {language === 'ar' ? 'تعقيم ومكافحة البكتيريا والروائح' : 'Antimicrobial sanitization'}</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> {language === 'ar' ? 'فحص تسليك مجرى التصريف' : 'Drain pipe clearing & safety test'}</li>
              </ul>
              <Link href="/book/pkg_summer" className="block w-full rounded-2xl bg-primary py-3.5 text-center text-xs font-black text-white shadow-md hover:bg-primary-dark transition">
                {language === 'ar' ? 'احجز باقة الصيف' : 'Book Summer Package'}
              </Link>
            </div>

            {/* Package 3 */}
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col">
              <span className="text-xs font-black uppercase text-purple-600">{language === 'ar' ? 'رعاية سنوية للفلل' : 'Annual Villa Care'}</span>
              <h3 className="mt-1 text-xl font-black text-slate-900 dark:text-white">{language === 'ar' ? 'عقد صيانة منزلية كامل' : 'Full Home Maintenance'}</h3>
              <div className="mt-4 mb-6">
                <span className="text-3xl font-black text-slate-900 dark:text-white">{formatPrice(750)}</span>
                <span className="text-xs text-slate-500 ms-1">{language === 'ar' ? '/ سنة' : '/ year'}</span>
              </div>
              <ul className="space-y-3 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-8 flex-1">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-purple-500 shrink-0" /> {language === 'ar' ? '٤ زيارات فحص دوري للمكيفات' : '4 seasonal AC maintenance visits'}</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-purple-500 shrink-0" /> {language === 'ar' ? 'صيانة طوارئ ذات أولوية قصوى' : 'VIP Priority 24/7 hotline dispatch'}</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-purple-500 shrink-0" /> {language === 'ar' ? 'خصم ٢٠٪ على كافة قطع الغيار' : '20% off all spare parts'}</li>
              </ul>
              <div className="space-y-2">
                <Link href="/book/pkg_villa" className="block w-full rounded-2xl bg-purple-600 hover:bg-purple-700 text-white py-3.5 text-center text-xs font-black transition shadow-md">
                  {language === 'ar' ? 'حجز عقد صيانة الفلل' : 'Book Villa Care Plan'}
                </Link>
                <a
                  href={`https://wa.me/966590192146?text=${encodeURIComponent(
                    language === 'ar'
                      ? 'مرحباً ورشة أحمد للتبريد، أود الاستفسار عن باقة الرعاية السنوية للفلل (Annual Villa Care Plan)'
                      : 'Hello Ahmed Cooling, I would like to inquire about the Annual Villa Care Plan'
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded-2xl border border-purple-200 py-2.5 text-center text-xs font-bold text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-300 transition"
                >
                  {language === 'ar' ? 'استفسر عبر واتساب' : 'Inquire via WhatsApp'}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 7. WHY CHOOSE US (mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8) ═══ */}
      <section className="mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-xs font-black uppercase tracking-wider text-primary">
              {t.whyChooseUs}
            </span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white">
            {language === 'ar' ? 'لماذا يعتمد علينا آلاف العملاء في جدة ومكة؟' : 'Why Thousands of Saudi Households Trust Us'}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {whyItems.map((item, i) => (
            <div
              key={i}
              className="rounded-3xl border border-slate-200/80 bg-white p-7 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-800">
                {item.icon}
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                {item.title}
              </h3>
              <p className="mt-2 text-xs sm:text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-400">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 8. CUSTOMER REVIEWS (mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8) ═══ */}
      <section className="py-14 overflow-hidden border-y border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="text-xs font-black text-amber-500">4.9 / 5.0 RATING</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                {t.customerReviews}
              </h2>
            </div>
            <span className="rounded-2xl border border-blue-200 bg-primary-light px-4 py-1.5 text-xs font-black text-primary dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400">
              {t.ratingPill}
            </span>
          </div>
        </div>

        <div className="relative">
          <div className="flex w-max animate-marquee gap-5 px-4 hover:[animation-play-state:paused]">
            {[...reviews, ...reviews].map((r, i) => (
              <div
                key={i}
                className="w-80 shrink-0 rounded-3xl border border-slate-200/80 bg-slate-50/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-800/60 sm:w-96"
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-xs font-black text-white">
                    {r.name
                      ?.split(' ')
                      .map((w) => w[0])
                      .join('')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                      {r.name}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      📍 {r.city} • <span className="text-emerald-600 font-bold">{language === 'ar' ? 'عميل موثق' : 'Verified'}</span>
                    </p>
                  </div>
                  <div className="flex text-amber-400 text-xs">
                    {'⭐'.repeat(r.rating || 5)}
                  </div>
                </div>
                <p className="line-clamp-3 text-xs sm:text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-300">
                  &ldquo;{r.text}&rdquo;
                </p>
                <p className="mt-3 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                  {r.timeAgo}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 9. SERVICE AREAS (mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8) ═══ */}
      <section className="mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700 mb-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{language === 'ar' ? 'فنيون متواجدون الآن بالقرب منك' : 'Technicians Available Now'}</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white">
            {t.serviceAreas}
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {language === 'ar' ? 'نغطي كافة أحياء مدينتي جدة ومكة المكرمة بسيارات مجهزة بالكامل' : 'Fast mobile technician coverage across all major districts'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Jeddah */}
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-100 text-primary dark:bg-blue-950/60 dark:text-blue-300">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">{t.cityJeddah}</h3>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{language === 'ar' ? 'تغطية شاملة لكل الأحياء' : 'Full city coverage'}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {JEDDAH_AREAS.map((area, idx) => (
                <span key={idx} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                  {area}
                </span>
              ))}
            </div>
          </div>

          {/* Makkah */}
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-100 text-purple-600 dark:bg-purple-950/60 dark:text-purple-300">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">{t.cityMakkah}</h3>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{language === 'ar' ? 'خدمة سريعة في كافة المناطق' : 'Rapid dispatch across all zones'}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {MAKKAH_AREAS.map((area, idx) => (
                <span key={idx} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                  {area}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 10. FREQUENTLY ASKED QUESTIONS (FAQS - mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8) ═══ */}
      <section className="mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8 py-16 border-t border-slate-200/80 dark:border-slate-800">
        <div className="text-center mb-10">
          <span className="text-xs font-black uppercase tracking-wider text-primary">FAQS</span>
          <h2 className="mt-1 text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
            {language === 'ar' ? 'الأسئلة الأكثر تكراراً' : 'Frequently Asked Questions'}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {HOME_FAQS.map((faq, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center gap-3">
                <HelpCircle className="h-5 w-5 text-primary shrink-0" />
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {language === 'ar' ? faq.qAr : faq.qEn}
                </h3>
              </div>
              <p className="mt-3 text-xs sm:text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-300 ps-8">
                {language === 'ar' ? faq.aAr : faq.aEn}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 11. EMERGENCY HOTLINE RED STRIP (mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8) ═══ */}
      <section className="mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8 pb-12">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 rounded-3xl border-2 border-red-300 bg-gradient-to-r from-red-600 via-red-500 to-rose-600 p-8 text-white shadow-2xl">
          <div className="flex items-center gap-4 text-center sm:text-start">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md">
              <AlertTriangle className="h-8 w-8 text-white animate-bounce" />
            </div>
            <div>
              <span className="inline-block rounded-lg bg-black/20 px-2.5 py-0.5 text-xs font-black text-white mb-1">
                🚨 24/7 EMERGENCY
              </span>
              <h3 className="text-xl sm:text-2xl font-black">
                {t.emergencyStripTitle}
              </h3>
              <p className="mt-1 text-xs sm:text-sm font-medium text-white/90">
                {t.emergencyStripSub}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href={`tel:${PHONE}`}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-sm sm:text-base font-black text-red-600 shadow-xl transition hover:scale-105 hover:bg-red-50"
            >
              <Phone className="h-5 w-5" />
              <span>{t.emergencyStripCta}: 0590192146</span>
            </a>

            <a
              href="https://wa.me/966590192146"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-white/40 bg-white/10 px-6 py-4 text-sm sm:text-base font-black text-white backdrop-blur-md transition hover:bg-white/20"
            >
              <MessageSquare className="h-5 w-5" />
              <span>WhatsApp</span>
            </a>
          </div>
        </div>
      </section>

      {/* ═══ 12. RATE US EXPERIENCE (mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8) ═══ */}
      <section className="mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8 pb-14">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-400 via-orange-400 to-pink-500 p-8 text-center shadow-xl sm:p-12">
          <div className="pointer-events-none absolute -top-10 -left-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-10 -right-10 h-52 w-52 rounded-full bg-white/10" />
          <div className="relative">
            <div className="mb-3 flex items-center justify-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="h-7 w-7 fill-white text-white sm:h-9 sm:w-9" />
              ))}
            </div>
            <h2 className="text-2xl font-black text-white sm:text-3xl">
              {t.howWasExperience || 'How was your experience?'}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm font-medium text-white/90">
              {t.shareYourFeedback || 'Share your feedback and help us improve our service'}
            </p>
            <button
              onClick={handleRateClick}
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-3.5 text-sm font-black text-orange-600 shadow-lg transition-transform hover:scale-105"
            >
              <Star className="h-5 w-5" />
              <span>{t.rateUs || 'Rate Us'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Trust Footer line */}
      <div className="flex items-center justify-center gap-2 pb-10">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
          {t.trustedFooter}
        </p>
      </div>
    </div>
  );
}
