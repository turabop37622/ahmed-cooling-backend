'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Phone, Mail, MapPin, Snowflake, Lock } from 'lucide-react';
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
          <div className="space-y-4">
            <Link href="/" className="inline-flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-600/20">
                <Snowflake className="w-5 h-5" />
              </div>
              <span className="text-lg font-bold text-white tracking-tight">
                {isAr ? 'ورشة أحمد للتبريد' : 'Ahmed Cooling'}
              </span>
            </Link>
            <p className="text-sm text-slate-400 leading-relaxed max-w-sm">
              {isAr
                ? 'خدمات صيانة وتكييف الهواء والأجهزة المنزلية المعتمدة في جدة ومكة المكرمة بضمان رسمي وقطع غيار أصلية.'
                : 'Certified AC and home appliance repair specialists in Jeddah & Makkah with guaranteed quality and official warranty.'}
            </p>
            <div className="flex items-center gap-3 pt-1">
              <a
                href="https://wa.me/966590192146"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:border-emerald-500/40 transition"
                aria-label="WhatsApp"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.699c.971.53 1.77.813 2.795.814 3.186 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.767-5.77zm3.375 8.163c-.145.407-.738.77-1.023.809-.283.039-.652.179-2.12-.43-1.874-.778-3.08-2.697-3.175-.823-.093-.127-.751-1.002-.751-1.91 0-.909.475-1.354.644-1.54.169-.186.368-.233.491-.233.123 0 .246.002.353.007.113.006.264-.043.413.315.153.368.523 1.275.569 1.368.046.094.077.204.015.328-.061.124-.092.202-.184.309-.092.108-.194.241-.277.324-.093.092-.19.192-.082.378.108.185.48 1.157 1.03 1.646.709.631 1.307.828 1.492.92.185.093.293.078.401-.047.108-.124.462-.538.585-.723.123-.185.246-.154.414-.092.169.061 1.077.508 1.261.6.185.093.308.139.354.216.046.077.046.447-.099.854z"/></svg>
              </a>
              <a
                href="https://www.facebook.com/profile.php?id=61589456784736"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-blue-400 hover:border-blue-500/40 transition"
                aria-label="Facebook"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </a>
              <a
                href="https://www.instagram.com/ahmedcoolingworkshop/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-pink-400 hover:border-pink-500/40 transition"
                aria-label="Instagram"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
              </a>
            </div>
          </div>

          {/* 2. Services */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4">
              {isAr ? 'الخدمات الرئيسية' : 'Services'}
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/services" className="hover:text-white transition-colors">
                  {isAr ? 'صيانة وإصلاح المكيفات' : 'AC Repair & Diagnostics'}
                </Link>
              </li>
              <li>
                <Link href="/services" className="hover:text-white transition-colors">
                  {isAr ? 'غسيل وتنظيف عميق' : 'AC Deep Jet Wash'}
                </Link>
              </li>
              <li>
                <Link href="/services" className="hover:text-white transition-colors">
                  {isAr ? 'شحن فريون أصلي' : 'Freon Gas Refill'}
                </Link>
              </li>
              <li>
                <Link href="/services" className="hover:text-white transition-colors">
                  {isAr ? 'صيانة الثلاجات والفريزر' : 'Refrigerator Repair'}
                </Link>
              </li>
              <li>
                <Link href="/services" className="hover:text-white transition-colors">
                  {isAr ? 'صيانة الغسالات' : 'Washing Machine Repair'}
                </Link>
              </li>
            </ul>
          </div>

          {/* 3. Company */}
          <div>
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
          <div>
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
                  {isAr ? 'حي الروضة، جدة ومكة المكرمة' : 'Al-Rawdah, Jeddah & Makkah, KSA'}
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-14 pt-8 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>
            &copy; {new Date().getFullYear()} {isAr ? 'ورشة أحمد للتبريد. جميع الحقوق محفوظة.' : 'Ahmed Cooling Workshop. All rights reserved.'}
          </p>

          <div className="flex items-center gap-5">
            <span>{isAr ? 'جدة ومكة المكرمة 🇸🇦' : 'Jeddah & Makkah 🇸🇦'}</span>
            <Link href="/admin/login" className="inline-flex items-center gap-1.5 hover:text-slate-400 transition">
              <Lock className="w-3 h-3" />
              <span>{isAr ? 'الإدارة' : 'Staff'}</span>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
