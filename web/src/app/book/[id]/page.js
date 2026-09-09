'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Loader2, MapPin, Calendar, Clock, FileText,
  ChevronLeft, ChevronRight, User, Phone, CheckCircle2, Shield,
  Sparkles, AlertCircle, Mail, Navigation, Edit3, Building2,
  Refrigerator, WashingMachine, Snowflake, Wind, Flame, Wrench,
} from 'lucide-react';
import { useTranslation } from '@/contexts/TranslationContext';
import { useAuth } from '@/contexts/AuthContext';
import { getServices, createBooking, updateProfile } from '@/lib/api';

const VISIT_FEE = 200;

const TIME_SLOTS = [
  { time: '09:00 AM', busy: false },
  { time: '10:00 AM', busy: false },
  { time: '11:00 AM', busy: true },
  { time: '12:00 PM', busy: false },
  { time: '01:00 PM', busy: false },
  { time: '02:00 PM', busy: true },
  { time: '03:00 PM', busy: false },
  { time: '04:00 PM', busy: false },
  { time: '05:00 PM', busy: false },
  { time: '06:00 PM', busy: false },
];

const COUNTRY_CODES = [
  { code: '+966', label: '🇸🇦 +966', country: 'SA' },
];

const DAY_NAMES_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_AR = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const MONTH_NAMES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_NAMES_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const LOCATION_DATA = {
  jeddah: {
    en: 'Jeddah', ar: 'جدة',
    areas: [
      { en: 'Abhur', ar: 'أبحر' },
      { en: 'Al Ajwad', ar: 'الأجواد' },
      { en: 'Al Andalus', ar: 'الأندلس' },
      { en: 'Al Aziziyah', ar: 'العزيزية' },
      { en: 'Al Balad', ar: 'البلد' },
      { en: 'Al Basateen', ar: 'البساتين' },
      { en: 'Al Bawadi', ar: 'البوادي' },
      { en: 'Al Faisaliyyah', ar: 'الفيصلية' },
      { en: 'Al Hamra', ar: 'الحمراء' },
      { en: 'Al Hamdaniyah', ar: 'الحمدانية' },
      { en: 'Al Khalidiyyah', ar: 'الخالدية' },
      { en: 'Al Manar', ar: 'المنار' },
      { en: 'Al Marwah', ar: 'المروة' },
      { en: 'Al Muhammadiyah', ar: 'المحمدية' },
      { en: 'Al Nahdah', ar: 'النهضة' },
      { en: 'Al Naim', ar: 'النعيم' },
      { en: 'Al Naseem', ar: 'النسيم' },
      { en: 'Al Rabwah', ar: 'الربوة' },
      { en: 'Al Rawdah', ar: 'الروضة' },
      { en: 'Al Rehab', ar: 'الرحاب' },
      { en: 'Al Safa', ar: 'الصفا' },
      { en: 'Al Salamah', ar: 'السلامة' },
      { en: 'Al Samer', ar: 'السامر' },
      { en: 'Al Sharafiyah', ar: 'الشرفية' },
      { en: 'Al Shati', ar: 'الشاطئ' },
      { en: 'Al Thaghr', ar: 'الثغر' },
      { en: 'Al Wurud', ar: 'الورود' },
      { en: 'Al Zahra', ar: 'الزهراء' },
      { en: 'Bryman', ar: 'بريمان' },
    ],
  },
  makkah: {
    en: 'Makkah', ar: 'مكة المكرمة',
    areas: [
      { en: 'Al Adl', ar: 'العدل' },
      { en: 'Al Awali', ar: 'العوالي' },
      { en: 'Al Aziziyah', ar: 'العزيزية' },
      { en: 'Al Buhayrat', ar: 'البحيرات' },
      { en: 'Al Hajlah', ar: 'الحجلة' },
      { en: 'Al Hindawiyyah', ar: 'الهنداوية' },
      { en: 'Al Jamiah', ar: 'الجامعة' },
      { en: 'Al Kakiyyah', ar: 'الكعكية' },
      { en: 'Al Khalidiyyah', ar: 'الخالدية' },
      { en: 'Al Maabdah', ar: 'المعابدة' },
      { en: 'Al Misfalah', ar: 'المسفلة' },
      { en: 'Al Naseem', ar: 'النسيم' },
      { en: 'Al Nuzha', ar: 'النزهة' },
      { en: 'Al Rusayfah', ar: 'الرصيفة' },
      { en: 'Al Shisha', ar: 'الشيشة' },
      { en: 'Al Shoqiyah', ar: 'الشوقية' },
      { en: 'Al Taneem', ar: 'التنعيم' },
      { en: 'Al Utaibiyyah', ar: 'العتيبية' },
      { en: 'Al Zaidi', ar: 'الزايدي' },
      { en: 'Jarwal', ar: 'جرول' },
      { en: 'Kudai', ar: 'كدي' },
    ],
  },
};

function getMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid = [];
  let week = new Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) {
      grid.push(week);
      week = [];
    }
  }
  if (week.length) {
    while (week.length < 7) week.push(null);
    grid.push(week);
  }
  return grid;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isPast(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

const FALLBACK_SERVICES = [
  {
    _id: 'pkg_diagnostic',
    id: 'pkg_diagnostic',
    name: 'Diagnostic Repair Visit',
    nameAr: 'فحص وتشخيص عطل بالمنزل',
    basePrice: 150,
    icon: '🔍',
    category: 'ac',
    description: 'Comprehensive on-site diagnostic of cooling faults, electrical issues, and upfront written quote with warranty.',
    descriptionAr: 'فحص شامل للعطل بالمنزل مع تسعير مسبق معتمد وضمان رسمي على الصيانة.',
  },
  {
    _id: 'pkg_summer',
    id: 'pkg_summer',
    name: 'Summer AC Prep - Deep Wash + Gas Topup',
    nameAr: 'باقة التبريد المثالي - غسيل عميق وشحن فريون',
    basePrice: 280,
    icon: '❄️',
    category: 'ac',
    description: 'High pressure coil & blower wash, refrigerant gas check and top-up, antimicrobial sanitization, and drain clearing.',
    descriptionAr: 'غسيل ضغط عالي للمبخر والمروحة وشحن فريون أصلي مع تعقيم ومكافحة الروائح وتسليك مجرى التصريف.',
  },
  {
    _id: 'pkg_villa',
    id: 'pkg_villa',
    name: 'Annual Villa Care - Full Home Maintenance',
    nameAr: 'عقد رعاية سنوية للفلل والمنازل',
    basePrice: 750,
    icon: '🏡',
    category: 'general',
    description: '4 seasonal AC maintenance visits, VIP priority 24/7 hotline dispatch, and 20% off all spare parts.',
    descriptionAr: '٤ زيارات فحص دوري للمكيفات مع صيانة طوارئ ذات أولوية قصوى وخصم ٢٠٪ على قطع الغيار.',
  },
  {
    _id: '1',
    id: '1',
    name: 'AC Repair & Diagnostics',
    nameAr: 'صيانة وفحص المكيفات',
    basePrice: 150,
    icon: '❄️',
    category: 'ac',
    description: 'Expert diagnostics and repair for all split, window, and central AC systems. We fix cooling faults, gas leaks, and noisy units.',
    descriptionAr: 'تشخيص وإصلاح احترافي لجميع مكيفات الاسبليت والشباك والمركزي. صيانة ضعف التبريد وتسريب الفريون والأعطال الكهربائية.',
  },
  {
    _id: '2',
    id: '2',
    name: 'AC Installation & Dismantling',
    nameAr: 'تركيب وفك مكيفات سبليت وشباك',
    basePrice: 200,
    icon: '🔧',
    category: 'ac',
    description: 'Professional split & window AC mounting, vacuum test, and leak-free copper piping done by certified technicians.',
    descriptionAr: 'فك وتركيب احترافي للمكيفات الجديدة والمنقولة مع فحص التفريغ وتمديد مواسير النحاس بأعلى معايير الأمان.',
  },
  {
    _id: '3',
    id: '3',
    name: 'AC Deep Cleaning & Sanitization',
    nameAr: 'غسيل وتنظيف عميق للمكيفات',
    basePrice: 100,
    icon: '🧹',
    category: 'ac',
    description: 'Complete high-pressure jet wash, antimicrobial coil sanitization, and drain clearing for maximum airflow & health.',
    descriptionAr: 'غسيل بأجهزة الضغط العالي ومواد التعقيم للمبخر والمروحة ومجرى التصريف لضمان هواء نقي وتبريد قوي.',
  },
  {
    _id: '4',
    id: '4',
    name: 'Refrigerator & Freezer Repair',
    nameAr: 'صيانة وإصلاح الثلاجات والفريزر',
    basePrice: 150,
    icon: '🧊',
    category: 'refrigerator',
    description: 'All refrigerator brands: compressor replacement, defrost timer fixes, thermostat calibration, and genuine gas refill.',
    descriptionAr: 'صيانة متخصصة لجميع ماركات الثلاجات والفريزر. تغيير الثرموستات والكمبروسر ومعالجة تسريب الفريون والثلج.',
  },
  {
    _id: '5',
    id: '5',
    name: 'Washing Machine Repair',
    nameAr: 'إصلاح وصيانة الغسالات',
    basePrice: 140,
    icon: '🧺',
    category: 'washing-machine',
    description: 'Expert repair for front-load and top-load washers: motor issues, water drainage, noisy bearings, and electronic PCB boards.',
    descriptionAr: 'إصلاح جميع أنواع الغسالات الأوتوماتيك والعادية: مشاكل دوران الحوض، طرد المياه، اهتزاز التجفيف ولوحات التحكم.',
  },
  {
    _id: '6',
    id: '6',
    name: 'AC Gas Refill (Freon R410A / R22)',
    nameAr: 'تعبئة غاز فريون أصلي',
    basePrice: 180,
    icon: '💨',
    category: 'ac',
    description: 'Pressure test, leak detection, complete evacuation, and 100% genuine refrigerant refill.',
    descriptionAr: 'شحن فريون أمريكي أصلي مع كشف وتصليح مكان التسريب وفحص الضغوط.',
  },
  {
    _id: '7',
    id: '7',
    name: 'Cooking Stove & Oven Repair',
    nameAr: 'صيانة الأفران والبوتاجازات',
    basePrice: 160,
    icon: '🔥',
    category: 'stove',
    description: 'Burner cleaning, ignition fixes, thermostat replacement, and gas safety checks.',
    descriptionAr: 'صيانة شعلات الغاز وتغيير الحساسات وضبط درجات حرارة الأفران.',
  },
];

export default function BookingPage() {
  const params = useParams();
  const router = useRouter();
  const { t, language, isRTL, toAr, formatPrice } = useTranslation();
  const { user, token, loading: authLoading, updateUser } = useAuth();

  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(null);

  const [fullName, setFullName] = useState('');
  const [countryCode, setCountryCode] = useState('+966');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [customArea, setCustomArea] = useState('');
  const [subLocation, setSubLocation] = useState('');
  const [isManualAddress, setIsManualAddress] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [locating, setLocating] = useState(false);
  const [errors, setErrors] = useState({});

  const handleSelectCity = (cityKey) => {
    setSelectedCity(cityKey);
    setSelectedArea('');
    setCustomArea('');
    setSubLocation('');
    setErrors((prev) => ({ ...prev, city: null, area: null }));
    setTimeout(() => {
      const areaEl = document.getElementById('field-area');
      if (areaEl) {
        areaEl.focus();
        areaEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 150);
  };

  const handlePhoneChange = (e) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.startsWith('0')) {
      val = val.replace(/^0+/, '');
    }
    setPhoneNumber(val.slice(0, 9));
    if (errors.phone) setErrors((prev) => ({ ...prev, phone: null }));
  };

  const handleDetectLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      alert(language === 'ar' ? 'المتصفح لا يدعم تحديد الموقع التلقائي' : 'Geolocation is not supported by your browser');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ahmed-cooling-backend.onrender.com/api';
          const res = await fetch(`${backendUrl}/geocode/reverse?lat=${latitude}&lng=${longitude}&lang=${language || 'en'}`);
          const data = await res.json();
          if (data?.address) {
            setIsManualAddress(true);
            setManualAddress(data.address);
          } else {
            setIsManualAddress(true);
            setManualAddress(`GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          }
        } catch {
          setIsManualAddress(true);
          setManualAddress(`GPS: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        alert(language === 'ar' ? 'يرجى تفعيل صلاحية الموقع أو كتابة العنوان يدوياً.' : 'Location permission denied or unavailable. Please enter address manually.');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }, []);
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());

  useEffect(() => {
    let currentUser = user;
    if (!currentUser && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('user');
        if (saved) currentUser = JSON.parse(saved);
      } catch (e) {}
    }

    if (currentUser) {
      const displayName = currentUser.fullName || currentUser.name || currentUser.customerName || '';
      if (displayName) {
        setFullName(displayName);
      }

      const rawPhone = String(currentUser.phone || currentUser.phoneNumber || '').trim();
      if (rawPhone) {
        if (rawPhone.startsWith('+966')) {
          setCountryCode('+966');
          setPhoneNumber(rawPhone.replace('+966', '').replace(/^0/, ''));
        } else if (rawPhone.startsWith('966')) {
          setCountryCode('+966');
          setPhoneNumber(rawPhone.replace('966', '').replace(/^0/, ''));
        } else if (rawPhone.startsWith('+92')) {
          setCountryCode('+92');
          setPhoneNumber(rawPhone.replace('+92', '').replace(/^0/, ''));
        } else {
          setPhoneNumber(rawPhone.replace(/^0/, ''));
        }
      }

      if (currentUser.address) {
        const raw = String(currentUser.address).trim();
        const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          const cityEn = parts[parts.length - 1];
          const areaEn = parts[parts.length - 2];
          const sub = parts.slice(0, -2).join(', ');

          const cityKey = Object.entries(LOCATION_DATA).find(
            ([, c]) => c?.en?.toLowerCase() === cityEn?.toLowerCase() || c?.ar?.toLowerCase() === cityEn?.toLowerCase()
          )?.[0];
          if (cityKey) {
            setSelectedCity(cityKey);
            const foundArea = LOCATION_DATA[cityKey]?.areas?.find(
              (a) => a.en?.toLowerCase() === areaEn?.toLowerCase() || a.ar?.toLowerCase() === areaEn?.toLowerCase()
            );
            if (foundArea) {
              setSelectedArea(foundArea.en);
            }
            if (sub) setSubLocation(sub);
          } else {
            setSubLocation(raw);
          }
        } else {
          setSubLocation(raw);
        }
      }
    }
  }, [user]);

  useEffect(() => {
    loadService();
  }, [params.id]);

  const loadService = async () => {
    setLoading(true);
    try {
      const targetId = String(params.id || '').trim();
      let found = null;

      // 1. Check known packages and fallbacks first for instant resolution
      found = FALLBACK_SERVICES.find(
        (s) => s._id === targetId || s.id === targetId
      );

      // 2. Query live services from API
      if (!found) {
        try {
          const res = await getServices();
          const list = res?.services ?? res?.data ?? res;
          if (Array.isArray(list)) {
            found = list.find((s) => (s._id || s.id) === targetId);
          }
        } catch (apiErr) {
          console.warn('API services fetch error in booking page:', apiErr);
        }
      }

      // 3. Check numeric index (e.g. /book/1 -> FALLBACK_SERVICES[0])
      if (!found) {
        const numIndex = parseInt(targetId, 10);
        if (!isNaN(numIndex) && numIndex >= 1 && numIndex <= FALLBACK_SERVICES.length) {
          found = FALLBACK_SERVICES[numIndex - 1];
        }
      }

      // 4. Ultimate fallback to prevent "Service not found" blocking the user
      if (!found) {
        found = {
          _id: targetId || 'general_repair',
          id: targetId || 'general_repair',
          name: 'Home Appliance Repair Visit',
          nameAr: 'زيارة كشف وصيانة منزلية',
          basePrice: 150,
          icon: '🔧',
          category: 'ac',
          description: 'Full inspection and diagnostic visit for home air conditioning and appliances in Jeddah & Makkah.',
          descriptionAr: 'فحص وتشخيص شامل لأجهزة التكييف والتبريد المنزلية في جدة ومكة المكرمة.',
        };
      }

      setService(found);
    } catch {
      setService(FALLBACK_SERVICES[0]);
    } finally {
      setLoading(false);
    }
  };

  const monthGrid = useMemo(() => getMonthGrid(calYear, calMonth), [calYear, calMonth]);
  const dayNames = language === 'ar' ? DAY_NAMES_AR : DAY_NAMES_EN;
  const monthNames = language === 'ar' ? MONTH_NAMES_AR : MONTH_NAMES_EN;

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1); }
    else setCalMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1); }
    else setCalMonth((m) => m + 1);
  };

  const selectQuickDate = (offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    setSelectedDate(d);
    setCalMonth(d.getMonth());
    setCalYear(d.getFullYear());
  };

  const getFullAddress = () => {
    if (isManualAddress) {
      return manualAddress.trim();
    }
    if (!selectedCity) return '';
    const city = LOCATION_DATA[selectedCity];
    const cityName = language === 'ar' ? city?.ar : city?.en;

    let areaName = '';
    if (selectedArea === 'OTHER') {
      areaName = customArea.trim();
    } else if (selectedArea) {
      const area = city?.areas.find((a) => a.en === selectedArea);
      areaName = language === 'ar' ? area?.ar : area?.en;
    }

    if (!areaName && !subLocation.trim()) return cityName || '';
    if (!subLocation.trim()) return `${areaName}, ${cityName}`;
    return `${subLocation.trim()}, ${areaName}, ${cityName}`;
  };

  const getCanonicalAddress = () => {
    if (isManualAddress) {
      return manualAddress.trim();
    }
    if (!selectedCity) return '';
    const city = LOCATION_DATA[selectedCity];
    const area = selectedArea === 'OTHER' ? { en: customArea.trim() } : city?.areas.find((a) => a.en === selectedArea);
    const areaEn = area?.en || customArea.trim() || 'General';
    const cityEn = city?.en || 'Jeddah';
    if (!subLocation.trim()) return `${areaEn}, ${cityEn}`;
    return `${subLocation.trim()}, ${areaEn}, ${cityEn}`;
  };

  const servicePrice = service?.basePrice || service?.price || 0;
  const totalAmount = servicePrice + VISIT_FEE;

  const validate = () => {
    const e = {};
    if (!fullName.trim()) e.fullName = t.enterNameMsg || (language === 'ar' ? 'الاسم مطلوب' : 'Full name is required');
    if (!phoneNumber.trim()) {
      e.phone = language === 'ar' ? 'رقم الجوال مطلوب' : 'Mobile number is required';
    } else if (phoneNumber.length !== 9 || !phoneNumber.startsWith('5')) {
      e.phone = language === 'ar' ? 'رقم الجوال السعودي يجب أن يتكون من 9 أرقام يبدأ بـ 5 (مثال: 501234567)' : 'Valid 9-digit Saudi mobile number required (5XXXXXXXX)';
    }
    if (!selectedDate) e.date = t.selectDateMsg || 'Select a date';

    if (isManualAddress) {
      if (!manualAddress.trim()) e.manualAddress = language === 'ar' ? 'أدخل عنوانك بالتفصيل' : 'Please enter your full address';
    } else {
      if (!selectedCity) e.city = language === 'ar' ? 'اختر المدينة' : 'City is required';
      if (selectedCity && !selectedArea) e.area = language === 'ar' ? 'اختر المنطقة' : 'Area is required';
      if (selectedArea === 'OTHER' && !customArea.trim()) e.customArea = language === 'ar' ? 'أدخل اسم الحي' : 'District name required';
      if (selectedArea && !subLocation.trim()) e.subLocation = language === 'ar' ? 'أدخل العنوان التفصيلي' : 'Street/House details required';
    }

    setErrors(e);

    const keys = Object.keys(e);
    if (keys.length > 0) {
      const elementIdMap = {
        fullName: 'field-fullName',
        phone: 'field-phone',
        date: 'field-date',
        manualAddress: 'field-manualAddress',
        city: 'field-city',
        area: 'field-area',
        customArea: 'field-customArea',
        subLocation: 'field-subLocation',
      };
      const targetId = elementIdMap[keys[0]];
      if (typeof window !== 'undefined' && targetId) {
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
              el.focus();
            } else {
              const input = el.querySelector('input, select, textarea, button');
              if (input) input.focus();
            }
          }, 350);
        }
      }
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const bookingData = {
        userId: user?._id || user?.id || null,
        userEmail: user?.email || '',
        userName: user?.fullName || user?.name || fullName.trim(),
        service: {
          id: service?._id || service?.id || params.id,
          name: service?.name || '',
          name_en: service?.name_en || service?.name || '',
          name_ar: service?.name_ar || service?.nameAr || '',
          icon: service?.icon || '🔧',
          basePrice: parseInt(service?.basePrice || service?.price || 0),
          category: service?.category || 'general',
        },
        customerName: fullName.trim(),
        phone: `${countryCode}${phoneNumber.trim()}`,
        email: user?.email || '',
        date: selectedDate.toISOString().split('T')[0],
        time: selectedTime || 'Anytime',
        address: getFullAddress(),
        coordinates: { latitude: 0, longitude: 0 },
        comments: notes.trim(),
        language: language || 'en',
        platform: 'web',
        totalAmount,
      };
      const res = await createBooking(bookingData);
      if (res?.success) {
        try {
          if (user) {
            const canonicalAddress = getCanonicalAddress();
            const fullPhone = `${countryCode}${phoneNumber.trim()}`;
            const profileRes = await updateProfile({
              phone: fullPhone,
              address: canonicalAddress,
            });
            const updated = profileRes?.user || profileRes?.data;
            if (updated) {
              updateUser({ ...user, ...updated, phone: updated.phone || fullPhone, address: updated.address || canonicalAddress });
            } else {
              updateUser({ ...user, phone: fullPhone, address: canonicalAddress });
            }
          }
        } catch {
          // If profile update fails, booking still succeeded; keep silent.
        }
        // Save booking to localStorage so Admin panel reflects it instantly
        try {
          const rawBkg = res?.data?.booking || res?.booking || res?.data || {};
          const localEntry = {
            _id: rawBkg._id || ('bkg_' + Date.now()),
            bookingId: res?.data?.bookingId || rawBkg.bookingId || ('BK' + Date.now()),
            orderNumber: rawBkg.orderNumber || res?.data?.orderNumber || ('ORD-' + Date.now()),
            customerName: fullName.trim(),
            phone: `${countryCode}${phoneNumber.trim()}`,
            email: user?.email || '',
            service: {
              id: service?._id || service?.id || params.id,
              name: svcName || service?.name || 'Service',
              icon: service?.icon || '❄️',
              basePrice: parseInt(service?.basePrice || service?.price || 0),
            },
            date: selectedDate.toISOString().split('T')[0],
            time: selectedTime,
            address: getFullAddress(),
            status: 'pending',
            totalAmount,
            createdAt: new Date().toISOString(),
          };
          const existing = JSON.parse(localStorage.getItem('local_recent_bookings') || '[]');
          existing.unshift(localEntry);
          localStorage.setItem('local_recent_bookings', JSON.stringify(existing.slice(0, 50)));
        } catch (storageErr) {
          console.warn('Failed to cache booking locally:', storageErr);
        }

        setBookingSuccess({
          orderId: res?.data?.bookingId || res?.data?.booking?.orderNumber || res?.data?.booking?.bookingId || '',
          serviceName: svcName,
          serviceIcon: service?.icon || '🔧',
          date: selectedDate.toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
          time: selectedTime,
          address: getFullAddress(),
          total: formatPrice(totalAmount),
        });
      } else {
        alert(res?.message || t.bookingErrorMsg || 'Failed to create booking.');
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || '';
      alert(msg || t.bookingErrorMsg || 'Failed to create booking. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-bg dark:bg-slate-950">
        <Loader2 className="h-10 w-10 animate-spin text-primary dark:text-blue-400" />
        <p className="text-sm font-semibold text-sub dark:text-slate-400">{t.loading}</p>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-bg dark:bg-slate-950">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-sm font-bold text-text dark:text-white">Service not found</p>
        <button onClick={() => router.push('/services')} className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white hover:bg-primary-dark">
          {t.browseServices || 'Browse Services'}
        </button>
      </div>
    );
  }

  const svcName = language === 'ar' && service.nameAr ? service.nameAr : service.name;
  const svcDesc = language === 'ar' && service.descriptionAr ? service.descriptionAr : service.description;

  if (bookingSuccess) {
    return (
      <div className="min-h-screen bg-bg dark:bg-slate-950" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="mx-auto flex max-w-lg flex-col items-center px-4 pt-16 pb-10">
          {/* Success Animation Circle */}
          <div className="relative mb-6">
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30">
                <CheckCircle2 className="h-10 w-10 text-white" />
              </div>
            </div>
            <div className="absolute -top-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md dark:bg-slate-800">
              <Sparkles className="h-4 w-4 text-amber-500" />
            </div>
          </div>

          {/* Title */}
          <h1 className="mb-1 text-2xl font-black text-text dark:text-white">
            {language === 'ar' ? 'تم تأكيد الحجز!' : 'Booking Confirmed!'}
          </h1>
          <p className="mb-6 text-center text-sm font-medium text-sub dark:text-slate-400">
            {language === 'ar' ? 'سنتواصل معك قريباً لتأكيد الموعد' : 'We will contact you soon to confirm the appointment'}
          </p>

          {/* Order ID */}
          {bookingSuccess.orderId && (
            <div className="mb-6 rounded-xl bg-blue-50 px-5 py-2.5 dark:bg-blue-950/30">
              <p className="text-center text-xs font-bold text-sub dark:text-slate-400">
                {language === 'ar' ? 'رقم الطلب' : 'Order ID'}
              </p>
              <p className="text-center text-lg font-black tracking-wide text-primary dark:text-blue-400">
                #{bookingSuccess.orderId.slice(-8).toUpperCase()}
              </p>
            </div>
          )}

          {/* Booking Details Card */}
          <div className="mb-6 w-full overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            {/* Service Header */}
            <div className="flex items-center gap-3 border-b border-border bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-primary dark:bg-blue-950/50 dark:text-blue-400">
                <ServiceIcon service={service} className="w-6 h-6 stroke-[2]" />
              </div>
              <div>
                <p className="text-sm font-bold text-text dark:text-white">{bookingSuccess.serviceName}</p>
                <p className="text-xs font-semibold text-primary dark:text-blue-400">{bookingSuccess.total}</p>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-0 divide-y divide-border dark:divide-slate-700">
              <DetailRow icon={<Calendar className="h-4 w-4" />} label={language === 'ar' ? 'التاريخ' : 'Date'} value={bookingSuccess.date} />
              {bookingSuccess.time && bookingSuccess.time !== 'Anytime' && (
                <DetailRow icon={<Clock className="h-4 w-4" />} label={language === 'ar' ? 'الوقت' : 'Time'} value={bookingSuccess.time} />
              )}
              <DetailRow icon={<MapPin className="h-4 w-4" />} label={language === 'ar' ? 'العنوان' : 'Address'} value={bookingSuccess.address} />
            </div>

            {/* Payment Note */}
            <div className="border-t border-border bg-emerald-50 px-5 py-3 dark:border-slate-700 dark:bg-emerald-950/20">
              <p className="text-center text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                💵 {language === 'ar' ? 'الدفع نقداً بعد إتمام الخدمة' : 'Cash payment after service completion'}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex w-full flex-col gap-3">
            <button
              onClick={() => router.push('/bookings')}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-black text-white shadow-lg shadow-primary/25 transition hover:bg-primary-dark dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              {language === 'ar' ? 'عرض حجوزاتي' : 'View My Bookings'}
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-white py-3.5 text-sm font-bold text-text transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
            >
              {language === 'ar' ? 'العودة للرئيسية' : 'Back to Home'}
            </button>
          </div>

          {/* Trust Badge */}
          <div className="mt-6 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-emerald-500" />
            <p className="text-[11px] font-semibold text-sub dark:text-slate-500">
              {language === 'ar' ? 'حجزك مؤمّن ومشفّر' : 'Your booking is secured & encrypted'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg pb-10 dark:bg-slate-950" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6 lg:px-8">

        {!user && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-blue-200/80 bg-blue-50/80 px-4 py-3 text-xs text-blue-900 shadow-sm dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
            <div className="min-w-0">
              <span className="font-bold">{language === 'ar' ? 'حجز سريع كضيف:' : 'Quick Guest Booking:'}</span>{' '}
              <span>{language === 'ar' ? 'يمكنك إتمام الحجز بدون حساب، أو تسجيل الدخول لحفظ طلباتك.' : 'You can book directly without an account, or sign in to track your order.'}</span>
            </div>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="shrink-0 rounded-xl bg-blue-600 px-3 py-1.5 font-bold text-white shadow-sm hover:bg-blue-700 transition"
            >
              {language === 'ar' ? 'دخول' : 'Sign In'}
            </button>
          </div>
        )}

        {/* Service Hero Card */}
        <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur-sm shadow-inner">
                <ServiceIcon service={service} className="w-6 h-6 stroke-[2]" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-black text-white">{svcName}</h1>
                <p className="mt-0.5 text-sm text-blue-100">{svcDesc}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-blue-500/20 bg-blue-50 px-5 py-3 dark:bg-slate-800">
            <span className="text-xs font-bold text-sub dark:text-slate-400">{t.servicePrice || 'Service Price'}</span>
            <span className="text-lg font-black text-primary dark:text-blue-400">{formatPrice(servicePrice)}</span>
          </div>
        </div>

        {/* Contact Section */}
        <div className="flex items-center justify-between mb-2">
          <SectionTitle icon={<User className="h-5 w-5" />} title={t.contactInfo || 'Contact Information'} />
          {user && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'تم تعبئة بيانات حسابك' : 'Auto-filled from Account'}</span>
            </span>
          )}
        </div>
        <div className="mb-6 space-y-3 rounded-2xl border border-border bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-sub dark:text-slate-400">
              {t.fullNameInput || (language === 'ar' ? 'الاسم الكامل' : 'Full Name')} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-sub dark:text-slate-500" />
              <input
                id="field-fullName"
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: null }));
                }}
                placeholder={language === 'ar' ? 'أدخل اسمك الكريم' : 'Enter your full name'}
                className={`w-full rounded-xl border py-3 pr-4 pl-10 text-sm font-semibold text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:bg-slate-800 dark:text-white ${errors.fullName ? 'border-red-400' : 'border-border dark:border-slate-600'}`}
              />
            </div>
            {errors.fullName && <p className="mt-1 text-xs font-semibold text-red-500">{errors.fullName}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-sub dark:text-slate-400">
              {t.mobileNumber || (language === 'ar' ? 'رقم الجوال' : 'Mobile Number')} <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <select
                value={countryCode} onChange={(e) => setCountryCode(e.target.value)}
                className="shrink-0 rounded-xl border border-border bg-white px-2 py-3 text-sm font-bold text-text dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              >
                {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <div className="relative flex-1">
                <Phone className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-sub dark:text-slate-500" />
                <input
                  id="field-phone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={9}
                  value={phoneNumber}
                  onChange={handlePhoneChange}
                  placeholder="5XXXXXXXX"
                  className={`w-full rounded-xl border py-3 pr-4 pl-10 text-sm font-semibold text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:bg-slate-800 dark:text-white ${errors.phone ? 'border-red-400' : 'border-border dark:border-slate-600'}`}
                />
              </div>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
              <span>{language === 'ar' ? 'أدخل 9 أرقام تبدأ بـ 5 (مثال: 501234567)' : '9 digits starting with 5 (e.g. 501234567)'}</span>
              <span className={`font-mono font-bold ${phoneNumber.length === 9 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                {phoneNumber.length}/9
              </span>
            </div>
            {errors.phone && <p className="mt-1 text-xs font-semibold text-red-500">{errors.phone}</p>}
          </div>
          {user?.email && (
            <div>
              <label className="mb-1.5 block text-xs font-bold text-sub dark:text-slate-400">
                {language === 'ar' ? 'البريد الإلكتروني المرتبط بالحساب' : 'Account Email'}
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-sub dark:text-slate-500" />
                <input
                  type="email"
                  disabled
                  value={user.email}
                  className="w-full rounded-xl border border-border bg-slate-50 py-3 pr-4 pl-10 text-sm font-semibold text-slate-500 outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400 cursor-not-allowed"
                />
              </div>
            </div>
          )}
        </div>

        {/* Date Section */}
        <SectionTitle icon={<Calendar className="h-5 w-5" />} title={t.selectDate || (language === 'ar' ? 'تحديد التاريخ' : 'Select Date')} />
        <div id="field-date" className="mb-6 rounded-2xl border border-border bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          {/* Quick date buttons */}
          <div className="mb-4 flex gap-2">
            {[
              { label: t.today || 'Today', offset: 0 },
              { label: t.tomorrow || 'Tomorrow', offset: 1 },
              { label: t.dayAfter || 'Day After', offset: 2 },
            ].map(({ label, offset }) => {
              const d = new Date(today); d.setDate(d.getDate() + offset);
              const active = selectedDate && isSameDay(selectedDate, d);
              return (
                <button key={offset} onClick={() => selectQuickDate(offset)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-xs font-extrabold transition ${active ? 'border-primary bg-primary text-white' : 'border-border bg-white text-text hover:border-primary/40 dark:border-slate-600 dark:bg-slate-800 dark:text-white'}`}
                >{label}</button>
              );
            })}
          </div>

          {/* Calendar grid */}
          <div className="rounded-xl border border-border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="mb-3 flex items-center justify-between">
              <button onClick={prevMonth} className="rounded-lg p-1.5 transition hover:bg-slate-200 dark:hover:bg-slate-700">
                <ChevronLeft className="h-4 w-4 text-text dark:text-white" />
              </button>
              <span className="text-sm font-black text-text dark:text-white">
                {monthNames[calMonth]} {language === 'ar' ? toAr(calYear) : calYear}
              </span>
              <button onClick={nextMonth} className="rounded-lg p-1.5 transition hover:bg-slate-200 dark:hover:bg-slate-700">
                <ChevronRight className="h-4 w-4 text-text dark:text-white" />
              </button>
            </div>
            <div className="mb-1 grid grid-cols-7 gap-1">
              {dayNames.map((d) => (
                <div key={d} className="py-1 text-center text-[10px] font-bold text-sub dark:text-slate-500">{d}</div>
              ))}
            </div>
            {monthGrid.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1">
                {week.map((day, di) => {
                  if (!day) return <div key={di} />;
                  const date = new Date(calYear, calMonth, day);
                  const past = isPast(date);
                  const isToday = isSameDay(date, today);
                  const selected = selectedDate && isSameDay(date, selectedDate);
                  return (
                    <button key={di} disabled={past}
                      onClick={() => setSelectedDate(date)}
                      className={`flex h-9 w-full items-center justify-center rounded-lg text-xs font-bold transition
                        ${past ? 'cursor-not-allowed text-slate-300 dark:text-slate-600' : ''}
                        ${selected ? 'bg-primary text-white shadow-md' : ''}
                        ${isToday && !selected ? 'border border-primary text-primary dark:text-blue-400' : ''}
                        ${!past && !selected && !isToday ? 'text-text hover:bg-blue-50 dark:text-white dark:hover:bg-slate-700' : ''}
                      `}
                    >{language === 'ar' ? toAr(day) : day}</button>
                  );
                })}
              </div>
            ))}
          </div>
          {selectedDate && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-blue-50/80 px-3.5 py-2.5 text-xs font-bold text-primary dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/50">
              <Calendar className="h-4 w-4 shrink-0 text-primary dark:text-blue-400" />
              <span>
                {language === 'ar' ? 'الموعد المختار:' : 'Scheduled Date:'}{' '}
                {selectedDate.toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </div>
          )}
          {errors.date && <p className="mt-2 text-xs font-semibold text-red-500">{errors.date}</p>}
        </div>

        {/* Location Section */}
        <div className="mb-2 flex items-center justify-between">
          <SectionTitle icon={<MapPin className="h-5 w-5" />} title={t.serviceLocation || 'Service Location'} />
          <button
            type="button"
            onClick={() => {
              setIsManualAddress((prev) => !prev);
              setErrors((prev) => ({ ...prev, city: null, area: null, customArea: null, subLocation: null, manualAddress: null }));
            }}
            className="inline-flex items-center gap-1.5 text-xs font-extrabold text-primary hover:underline dark:text-blue-400"
          >
            {isManualAddress ? (
              <>
                <Building2 className="h-3.5 w-3.5" />
                <span>{language === 'ar' ? '📋 اختيار بالمدينة والحي' : '📋 Choose City & District'}</span>
              </>
            ) : (
              <>
                <Edit3 className="h-3.5 w-3.5" />
                <span>{language === 'ar' ? '✍️ كتابة العنوان يدوياً' : '✍️ Type Full Address Manually'}</span>
              </>
            )}
          </button>
        </div>

        <div className="mb-6 rounded-2xl border border-border bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          {/* Quick GPS auto-detect bar */}
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3 dark:border-blue-950/60 dark:bg-blue-950/30">
            <div className="flex items-center gap-2 min-w-0">
              <Navigation className="h-4 w-4 shrink-0 text-primary dark:text-blue-400" />
              <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-300">
                {language === 'ar' ? 'تحديد العنوان تلقائياً بواسطة الـ GPS' : 'Auto-detect address with GPS'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleDetectLocation}
              disabled={locating}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-white px-3 py-1.5 text-xs font-black text-primary shadow-xs hover:bg-blue-50/50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-blue-400 dark:hover:bg-slate-700 transition"
            >
              {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
              <span>{locating ? (language === 'ar' ? 'جارٍ التحديد...' : 'Locating...') : (language === 'ar' ? '📍 حدد موقعي' : '📍 Detect')}</span>
            </button>
          </div>

          {isManualAddress ? (
            /* Mode B: Full Manual Address Entry */
            <div id="field-manualAddress" className="space-y-2">
              <label className="block text-xs font-bold text-sub dark:text-slate-400">
                {language === 'ar' ? 'العنوان الكامل بالتفصيل' : 'Full Detailed Address'} <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                value={manualAddress}
                onChange={(e) => {
                  setManualAddress(e.target.value);
                  if (errors.manualAddress) setErrors((prev) => ({ ...prev, manualAddress: null }));
                }}
                placeholder={
                  language === 'ar'
                    ? 'مثال: جدة، حي الروضة، شارع صاري، عمارة ٤، الدور الثاني، شقة ٦'
                    : 'e.g., Jeddah, Al Rawdah, Sari Street, Building 4, 2nd Floor, Apt 6'
                }
                className={`w-full resize-none rounded-xl border py-3 px-4 text-sm font-semibold text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:bg-slate-800 dark:text-white ${
                  errors.manualAddress ? 'border-red-400' : manualAddress ? 'border-primary dark:border-blue-500' : 'border-border dark:border-slate-600'
                }`}
              />
              {errors.manualAddress && <p className="text-xs font-semibold text-red-500">{errors.manualAddress}</p>}
            </div>
          ) : (
            /* Mode A: Guided City & District Selection */
            <div className="space-y-4">
              {/* City Selection: 1-Click Buttons */}
              <div>
                <label className="mb-2 block text-xs font-bold text-sub dark:text-slate-400">
                  {language === 'ar' ? 'المدينة' : 'City'} <span className="text-red-500">*</span>
                </label>
                <div id="field-city" className="grid grid-cols-2 gap-2.5">
                  {Object.entries(LOCATION_DATA).map(([key, city]) => {
                    const active = selectedCity === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleSelectCity(key)}
                        className={`flex items-center justify-center gap-2 rounded-xl border py-3 px-4 text-sm font-black transition-all duration-200 ${
                          active
                            ? 'border-primary bg-primary text-white shadow-md shadow-primary/25 ring-2 ring-primary/20'
                            : 'border-border bg-white text-text hover:border-primary/50 hover:bg-blue-50/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700'
                        }`}
                      >
                        <span className="text-lg">{key === 'jeddah' ? '🏙️' : '🕋'}</span>
                        <span>{language === 'ar' ? city.ar : city.en}</span>
                      </button>
                    );
                  })}
                </div>
                {errors.city && <p className="mt-1 text-xs font-semibold text-red-500">{errors.city}</p>}
              </div>

              {/* Area Selection: Automatically revealed once city is selected! */}
              {selectedCity && (
                <div className="space-y-1.5 transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-sub dark:text-slate-400">
                      {language === 'ar' ? 'الحي / المنطقة' : 'District / Area'} <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] font-bold text-primary dark:text-blue-400">
                      {LOCATION_DATA[selectedCity]?.areas?.length || 0} {language === 'ar' ? 'حي متاح' : 'districts available'}
                    </span>
                  </div>
                  <select
                    id="field-area"
                    value={selectedArea}
                    onChange={(e) => {
                      setSelectedArea(e.target.value);
                      if (e.target.value !== 'OTHER') setCustomArea('');
                      setSubLocation('');
                      if (errors.area) setErrors((prev) => ({ ...prev, area: null }));
                    }}
                    className={`w-full rounded-xl border bg-white py-3 px-4 text-sm font-semibold text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:bg-slate-800 dark:text-white ${
                      errors.area ? 'border-red-400' : selectedArea ? 'border-primary dark:border-blue-500' : 'border-border dark:border-slate-600'
                    }`}
                  >
                    <option value="">{language === 'ar' ? '🔍 اختر الحي من القائمة...' : '🔍 Select district from list...'}</option>
                    {LOCATION_DATA[selectedCity]?.areas.map((area, i) => (
                      <option key={i} value={area.en}>{language === 'ar' ? area.ar : area.en}</option>
                    ))}
                    <option value="OTHER">✍️ {language === 'ar' ? 'حي آخر (كتابة اسم الحي يدوياً)' : 'Other District (Type Manually)'}</option>
                  </select>
                  {errors.area && <p className="text-xs font-semibold text-red-500">{errors.area}</p>}
                </div>
              )}

              {/* Custom Area if user chooses OTHER */}
              {selectedCity && selectedArea === 'OTHER' && (
                <div className="space-y-1.5 transition-all duration-300">
                  <label className="block text-xs font-bold text-sub dark:text-slate-400">
                    {language === 'ar' ? 'اسم الحي يدوياً' : 'District Name (Manual)'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="field-customArea"
                    type="text"
                    value={customArea}
                    onChange={(e) => {
                      setCustomArea(e.target.value);
                      if (errors.customArea) setErrors((prev) => ({ ...prev, customArea: null }));
                    }}
                    placeholder={language === 'ar' ? 'أدخل اسم الحي أو المعلم القريب' : 'Enter district or landmark name'}
                    className={`w-full rounded-xl border py-3 px-4 text-sm font-semibold text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:bg-slate-800 dark:text-white ${
                      errors.customArea ? 'border-red-400' : customArea ? 'border-primary dark:border-blue-500' : 'border-border dark:border-slate-600'
                    }`}
                  />
                  {errors.customArea && <p className="text-xs font-semibold text-red-500">{errors.customArea}</p>}
                </div>
              )}

              {/* SubLocation / Detailed Street details */}
              {selectedCity && selectedArea && (
                <div className="space-y-1.5 transition-all duration-300">
                  <label className="block text-xs font-bold text-sub dark:text-slate-400">
                    {language === 'ar' ? 'العنوان التفصيلي (الشارع / رقم المبنى / الشقة)' : 'Street / Building / Apt Details'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="field-subLocation"
                    type="text"
                    value={subLocation}
                    onChange={(e) => {
                      setSubLocation(e.target.value);
                      if (errors.subLocation) setErrors((prev) => ({ ...prev, subLocation: null }));
                    }}
                    placeholder={language === 'ar' ? 'مثال: شارع صاري، مبنى ٤، شقة ١٢' : 'e.g., Sari St, Building 4, Apt 12'}
                    className={`w-full rounded-xl border py-3 px-4 text-sm font-semibold text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:bg-slate-800 dark:text-white ${
                      errors.subLocation ? 'border-red-400' : subLocation ? 'border-primary dark:border-blue-500' : 'border-border dark:border-slate-600'
                    }`}
                  />
                  {errors.subLocation && <p className="text-xs font-semibold text-red-500">{errors.subLocation}</p>}
                </div>
              )}
            </div>
          )}

          {/* Real-time Full Address Confirmation Box */}
          {getFullAddress() && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  {language === 'ar' ? 'العنوان الذي سيصل للفني' : 'Confirmed Technician Address'}
                </p>
                <p className="text-xs font-bold text-text dark:text-white mt-0.5 break-words">
                  {getFullAddress()}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Notes Section */}
        <SectionTitle icon={<FileText className="h-5 w-5" />} title={t.additionalNotes || 'Additional Notes (Optional)'} />
        <div className="mb-6 rounded-2xl border border-border bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            placeholder={t.specialInstructions || 'Any special instructions for the technician...'}
            className="w-full resize-none rounded-xl border border-border bg-white py-3 px-4 text-sm font-semibold text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
        </div>

        {/* Summary Card */}
        <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-border px-5 py-3.5 dark:border-slate-700 flex items-center justify-between">
            <h3 className="text-sm font-black text-text dark:text-white">{t.bookingSummary || 'Booking Summary'}</h3>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary dark:text-blue-400">
              <ServiceIcon service={service} className="w-3.5 h-3.5 stroke-[2]" />
              <span>{svcName}</span>
            </span>
          </div>

          {/* Quick Live Preview Rows */}
          <div className="border-b border-border bg-slate-50/60 px-5 py-3 text-xs dark:border-slate-700 dark:bg-slate-800/40 space-y-1.5">
            <div className="flex items-center justify-between text-sub dark:text-slate-400">
              <span>{language === 'ar' ? 'العميل:' : 'Customer:'}</span>
              <span className="font-bold text-text dark:text-white truncate max-w-[200px]">
                {fullName.trim() || '—'} {phoneNumber ? `(${countryCode}${phoneNumber})` : ''}
              </span>
            </div>
            <div className="flex items-center justify-between text-sub dark:text-slate-400">
              <span>{language === 'ar' ? 'الموعد:' : 'Scheduled:'}</span>
              <span className="font-bold text-text dark:text-white">
                {selectedDate
                  ? selectedDate.toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })
                  : (language === 'ar' ? 'لم يحدد بعد' : 'Not selected')}
              </span>
            </div>
            <div className="flex items-center justify-between text-sub dark:text-slate-400">
              <span>{language === 'ar' ? 'الموقع:' : 'Location:'}</span>
              <span className="font-bold text-text dark:text-white truncate max-w-[220px]">
                {getFullAddress() || (language === 'ar' ? 'لم يحدد بعد' : 'Not specified')}
              </span>
            </div>
          </div>

          <div className="space-y-3 px-5 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-sub dark:text-slate-400">{t.serviceCharge || 'Service Charge'}</span>
              <span className="text-sm font-bold text-text dark:text-white">{formatPrice(servicePrice)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-sub dark:text-slate-400">{t.visitFee || 'Visit Fee'}</span>
              <span className="text-sm font-bold text-text dark:text-white">{formatPrice(VISIT_FEE)}</span>
            </div>
            <div className="border-t border-dashed border-border pt-3 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-text dark:text-white">{t.totalAmount || 'Total'}</span>
                <span className="text-xl font-black text-primary dark:text-blue-400">{formatPrice(totalAmount)}</span>
              </div>
            </div>
          </div>
          <div className="border-t border-border bg-blue-50/50 px-5 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="text-center text-[11px] font-semibold text-sub dark:text-slate-500">{t.cashPaymentNote || 'Cash payment after service completion'}</p>
          </div>
        </div>

        {/* Confirm Button */}
        <button onClick={handleSubmit} disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-black text-white shadow-lg shadow-primary/25 transition hover:bg-primary-dark disabled:opacity-60 dark:bg-blue-600 dark:shadow-blue-900/30 dark:hover:bg-blue-700"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
          {submitting ? (t.loading || 'Loading...') : (t.confirmBooking || 'Confirm Booking')}
        </button>

        <div className="mt-3 flex items-center justify-center gap-1.5 pb-4">
          <Shield className="h-3.5 w-3.5 text-emerald-500" />
          <p className="text-[11px] font-semibold text-sub dark:text-slate-500">{t.bookingSecure || 'Your booking is secured & encrypted'}</p>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon, title }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="text-primary dark:text-blue-400">{icon}</div>
      <h2 className="text-sm font-black text-text dark:text-white">{title}</h2>
    </div>
  );
}

function DetailRow({ icon, label, value }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3.5">
      <div className="mt-0.5 text-primary dark:text-blue-400">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-sub dark:text-slate-500">{label}</p>
        <p className="text-sm font-semibold text-text dark:text-white">{value}</p>
      </div>
    </div>
  );
}

function ServiceIcon({ service, className = 'w-6 h-6' }) {
  const text = `${service?.name || ''} ${service?.nameAr || ''} ${service?.name_en || ''} ${service?.name_ar || ''} ${service?.category || ''}`.toLowerCase();

  if (text.includes('ref') || text.includes('fridge') || text.includes('freezer') || text.includes('ثلاج') || text.includes('ice')) {
    return <Refrigerator className={className} />;
  }
  if (text.includes('wash') || text.includes('laundry') || text.includes('غسال')) {
    return <WashingMachine className={className} />;
  }
  if (text.includes('clean') || text.includes('jet') || text.includes('sanitiz') || text.includes('غسيل') || text.includes('تنظيف')) {
    return <Sparkles className={className} />;
  }
  if (text.includes('gas') || text.includes('freon') || text.includes('شحن') || text.includes('فريون')) {
    return <Wind className={className} />;
  }
  if (text.includes('stove') || text.includes('oven') || text.includes('cook') || text.includes('فرن') || text.includes('بوتجاز') || text.includes('طباخ')) {
    return <Flame className={className} />;
  }
  if (text.includes('ac') || text.includes('air') || text.includes('cool') || text.includes('مكيف') || text.includes('تبريد') || text.includes('سبليت')) {
    return <Snowflake className={className} />;
  }
  return <Wrench className={className} />;
}
