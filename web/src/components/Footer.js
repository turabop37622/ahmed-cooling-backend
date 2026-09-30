'use client';

import { Mail, MapPin, Phone, Snowflake } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from '../contexts/TranslationContext';

export default function Footer() {
  const pathname = usePathname();
  const { language, isRTL } = useTranslation();

  // Do not show on admin routes
  if (pathname?.startsWith('/admin')) return null;

  const isAr = language === 'ar';

  return (
    <footer className="bg-[#0A0E17] text-slate-400 border-t border-slate-800/80">
      <div className="mx-auto max-w-[1560px] px-6 sm:px-8 lg:px-12 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-10">

          {/* 1. Brand */}
          <div className="space-y-4 scroll-reveal">
            <Link href="/" className="inline-block group py-1">
              <img
                src={isAr ? "/logo-ar-white.png" : "/logo-en-white.png"}
                alt="Ahmed Cooling Workshop"
                className="h-11 sm:h-12 w-auto object-contain transition-transform duration-200 group-hover:scale-[1.02]"
              />
            </Link>
            <p className="text-sm text-slate-400 leading-relaxed max-w-sm">
              {isAr
                ? 'خدمات صيانة وتكييف الهواء والأجهزة المنزلية المعتمدة في المملكة العربية السعودية بضمان رسمي وقطع غيار أصلية.'
                : 'Certified AC and home appliance repair specialists in Saudi Arabia with guaranteed quality and official warranty.'}
            </p>
            <div className="flex items-center gap-3 pt-1">
              <a
                href="https://wa.me/966590192146"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:border-emerald-500/40 transition"
                aria-label="WhatsApp"
              >
                <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </a>
              <a
                href="https://www.facebook.com/profile.php?id=61589456784736"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-blue-400 hover:border-blue-500/40 transition"
                aria-label="Facebook"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
              </a>
              <a
                href="https://www.instagram.com/ahmedcoolingworkshop/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-pink-400 hover:border-pink-500/40 transition"
                aria-label="Instagram"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" /></svg>
              </a>
            </div>
          </div>

          {/* 2. Services */}
          <div className="scroll-reveal delay-100">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4">
              {isAr ? 'الخدمات الرئيسية' : 'Services'}
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/services?cat=ac" className="hover:text-white transition-colors">
                  {isAr ? 'صيانة وإصلاح المكيفات' : 'AC Repair & Diagnostics'}
                </Link>
              </li>
              <li>
                <Link href="/services?cat=cleaning" className="hover:text-white transition-colors">
                  {isAr ? 'غسيل وتنظيف عميق' : 'AC Deep Jet Wash'}
                </Link>
              </li>
              <li>
                <Link href="/services?cat=gas" className="hover:text-white transition-colors">
                  {isAr ? 'شحن فريون أصلي' : 'Freon Gas Refill'}
                </Link>
              </li>
              <li>
                <Link href="/services?cat=refrigerator" className="hover:text-white transition-colors">
                  {isAr ? 'صيانة الثلاجات والفريزر' : 'Refrigerator Repair'}
                </Link>
              </li>
              <li>
                <Link href="/services?cat=washing" className="hover:text-white transition-colors">
                  {isAr ? 'صيانة الغسالات' : 'Washing Machine Repair'}
                </Link>
              </li>
            </ul>
          </div>

          {/* 3. Company */}
          <div className="scroll-reveal delay-200">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4">
              {isAr ? 'روابط سريعة' : 'Company'}
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/about" className="hover:text-white transition-colors">
                  {isAr ? 'عن الورشة' : 'About Us'}
                </Link>
              </li>
              <li>
                <Link href="/services" className="hover:text-white transition-colors">
                  {isAr ? 'قائمة الأسعار' : 'Pricing & Services'}
                </Link>
              </li>
              <li>
                <Link href="/bookings" className="hover:text-white transition-colors">
                  {isAr ? 'متابعة الحجوزات' : 'Track Bookings'}
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-white transition-colors">
                  {isAr ? 'تواصل معنا' : 'Contact Us'}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  {isAr ? 'سياسة الخصوصية' : 'Privacy Policy'}
                </Link>
              </li>
            </ul>
          </div>

          {/* 4. Contact Info */}
          <div className="scroll-reveal delay-300">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4">
              {isAr ? 'معلومات الاتصال' : 'Contact'}
            </h4>
            <ul className="space-y-3 text-sm">
              <li>
                <a href="tel:+966590192146" className="flex items-center gap-2.5 hover:text-white transition-colors" dir="ltr">
                  <Phone className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>+966 590 192 146</span>
                </a>
              </li>
              <li>
                <a href="mailto:ahmedcoolingworkshop@gmail.com" className="flex items-center gap-2.5 hover:text-white transition-colors truncate">
                  <Mail className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="truncate">ahmedcoolingworkshop@gmail.com</span>
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-blue-500 shrink-0 mt-1" />
                <span className="leading-snug">
                  {isAr ? 'المملكة العربية السعودية (جدة • مكة المكرمة)' : 'Saudi Arabia (Jeddah • Makkah)'}
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Pricing notice in footer */}
        <div className="scroll-reveal-fade mt-12 pt-6 border-t border-slate-800/60 text-center text-xs text-slate-400 space-y-1">
          <p>
            {isAr
              ? 'الأسعار شاملة الضرائب المعمول بها • قطع الغيار غير مشمولة وتُحدد عند الفحص الميداني • أسعار الصيانة تبدأ من وتختلف حسب المعاينة الفنية.'
              : 'Prices include applicable VAT • Spare parts not included (quoted upon on-site diagnosis) • Prices start from and vary based on inspection.'}
          </p>
        </div>

        {/* Bottom bar */}
        <div className="scroll-reveal-fade mt-6 pt-6 border-t border-slate-800/40 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>
            &copy; {new Date().getFullYear()} {isAr ? 'ورشة أحمد للتبريد. جميع الحقوق محفوظة.' : 'Ahmed Cooling Workshop. All rights reserved.'}
          </p>

          <div className="flex items-center gap-5">
            <span>{isAr ? 'المملكة العربية السعودية 🇸🇦' : 'Saudi Arabia 🇸🇦'}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
