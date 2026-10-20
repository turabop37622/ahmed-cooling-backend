'use client';

import { useState, useEffect, useLayoutEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AdminAuthProvider, useAdminAuth, loginUrlFor } from './AdminAuthContext';
import { AdminLangProvider, useAdminLang } from './AdminI18n';
import { AdminToastProvider } from './components/AdminToast';
import ConfirmDialog from './components/ConfirmDialog';
import LangToggle from './components/LangToggle';
import { AdminTitleProvider, useAdminTitleOverride } from './components/useAdminTitle';
import {
  LayoutDashboard,
  ClipboardList,
  Wrench,
  Users,
  Star,
  MessageSquare,
  MessageCircle,
  Settings,
  LogOut,
  Menu,
  X,
  ExternalLink,
  ChevronLeft,
  ShieldCheck,
  HardHat,
  Sun,
  Moon,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

const NAV_ITEMS = [
  { href: '/admin/dashboard', en: 'Dashboard', ar: 'لوحة المعلومات', icon: LayoutDashboard },
  { href: '/admin/bookings', en: 'Bookings', ar: 'الحجوزات', icon: ClipboardList },
  { href: '/admin/technicians', en: 'Technicians', ar: 'الفنيون', icon: HardHat },
  { href: '/admin/services', en: 'Services', ar: 'الخدمات', icon: Wrench },
  { href: '/admin/users', en: 'Users', ar: 'المستخدمون', icon: Users },
  { href: '/admin/reviews', en: 'Reviews', ar: 'التقييمات', icon: Star },
  { href: '/admin/feedback', en: 'Messages & Ratings', ar: 'الرسائل والتقييمات', icon: MessageSquare },
  { href: '/admin/whatsapp', en: 'WhatsApp Inbox', ar: 'صندوق واتساب', icon: MessageCircle },
  { href: '/admin/settings', en: 'Settings', ar: 'الإعدادات', icon: Settings },
];

const LOGIN_TITLE = { en: 'Sign in', ar: 'تسجيل الدخول' };

const isActivePath = (pathname, href) => pathname === href || pathname.startsWith(`${href}/`);

// Browser tab title for every admin page: "<Page> | Admin · Ahmed Cooling"
function useShellTitle(pathname) {
  const { L } = useAdminLang();
  const override = useAdminTitleOverride();
  const item = NAV_ITEMS.find((n) => isActivePath(pathname, n.href));
  const page = override || (pathname === '/admin/login' ? L(LOGIN_TITLE.en, LOGIN_TITLE.ar) : item ? L(item.en, item.ar) : null);
  const suffix = L('Admin · Ahmed Cooling', 'لوحة التحكم · أحمد للتبريد');
  useEffect(() => {
    const wanted = page ? `${page} | ${suffix}` : suffix;
    const apply = () => {
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    // Next.js writes the site's metadata <title> after hydration / navigation; put ours back
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [page, suffix]);
}

// The admin panel has its own language; dir/lang go on the admin root and on <html> (so the global
// [dir="rtl"] font rule and anything rendered at body level agree). The site's TranslationProvider also
// writes <html dir/lang>, so keep re-applying ours while the admin panel is mounted.
function AdminRoot({ children }) {
  const { lang, dir, isAr } = useAdminLang();

  // Layout effect: <html dir> must match the admin root before the first paint, otherwise (html ltr, admin
  // rtl) the closed off-canvas sidebar sits past the right edge of an LTR viewport and widens the page.
  useLayoutEffect(() => {
    const html = document.documentElement;
    const previous = { dir: html.dir, lang: html.lang };
    const apply = () => {
      if (html.dir !== dir) html.dir = dir;
      if (html.lang !== lang) html.lang = lang;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(html, { attributes: true, attributeFilter: ['dir', 'lang'] });
    return () => {
      observer.disconnect();
      // Leaving the admin panel: give the site its own language back
      try {
        const saved = localStorage.getItem('language');
        const siteLang = saved === 'en' || saved === 'ar' ? saved : previous.lang || 'ar';
        html.dir = siteLang === 'ar' ? 'rtl' : 'ltr';
        html.lang = siteLang;
      } catch { /* ignore */ }
    };
  }, [dir, lang]);

  return (
    <div dir={dir} lang={lang} className={isAr ? 'font-arabic' : 'font-sans'}>
      {children}
    </div>
  );
}

function AdminShell({ children }) {
  const { user, token, loading, logout } = useAdminAuth();
  const { L, isAr } = useAdminLang();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const pathname = usePathname() || '';
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const isLogin = pathname === '/admin/login';

  useShellTitle(pathname);

  // Remember the collapsed sidebar
  useEffect(() => {
    try { setCollapsed(localStorage.getItem('adminSidebarCollapsed') === '1'); } catch { /* ignore */ }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try { localStorage.setItem('adminSidebarCollapsed', c ? '0' : '1'); } catch { /* ignore */ }
      return !c;
    });
  };

  // No (or expired) session: go to the login page and come back here afterwards
  useEffect(() => {
    if (!loading && !token && !isLogin) {
      const next = `${window.location.pathname}${window.location.search}`;
      router.replace(loginUrlFor(next === '/admin' ? null : next));
    }
  }, [loading, token, isLogin, router]);

  // Close the mobile menu on navigation and with Escape
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  if (isLogin) {
    return <div className="min-h-screen bg-slate-50 dark:bg-slate-950">{children}</div>;
  }

  if (loading || !token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300" role="status">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" aria-hidden="true" />
        <p className="text-sm font-medium">{L('Loading admin panel…', 'جارٍ تحميل لوحة التحكم…')}</p>
      </div>
    );
  }

  const showLabels = !collapsed || mobileOpen;
  const displayName = user?.fullName || user?.name || L('Admin', 'المسؤول');
  const themeLabel = isDarkMode ? L('Switch to light mode', 'التبديل إلى الوضع الفاتح') : L('Switch to dark mode', 'التبديل إلى الوضع الداكن');

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] dark:bg-[#090D16] text-[#0F172A] dark:text-[#F1F5F9] antialiased">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-[80] focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white"
      >
        {L('Skip to content', 'انتقل إلى المحتوى')}
      </a>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar. Closed off-canvas (below lg): slid out past the inline-start edge AND visibility:hidden, so
          its links can't be tabbed to or read out while off screen. visibility is in the transition list, so it
          stays visible during the slide-out and turns visible at once when opening. (Tailwind 4 translate-*
          sets the CSS `translate` property, not `transform`, so that is what gets transitioned.) */}
      <aside
        id="admin-sidebar"
        aria-label={L('Admin navigation', 'تنقل لوحة التحكم')}
        className={`fixed inset-y-0 start-0 z-50 flex flex-col bg-white dark:bg-[#0F172A] border-e border-slate-200 dark:border-slate-800 transition-[width,translate,visibility] duration-300 shadow-xl lg:shadow-none w-72 max-w-[85vw] lg:max-w-none ${
          mobileOpen ? 'translate-x-0' : 'max-lg:invisible -translate-x-full rtl:translate-x-full lg:translate-x-0 lg:rtl:translate-x-0'
        } ${collapsed ? 'lg:w-20' : 'lg:w-64'}`}
      >
        {/* Brand */}
        <div className="h-16 flex items-center justify-between gap-2 px-4 border-b border-slate-100 dark:border-slate-800/80 shrink-0">
          <Link href="/admin/dashboard" className="flex items-center gap-3 min-w-0 rounded-xl focus-visible:outline-2 focus-visible:outline-blue-600">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 dark:bg-blue-500/10 flex items-center justify-center shrink-0 p-1">
              <img src="/logo-icon.png" alt={showLabels ? '' : L('Ahmed Cooling — dashboard', 'أحمد للتبريد — لوحة المعلومات')} className="w-8 h-8 object-contain" />
            </div>
            {showLabels && (
              <div className="min-w-0">
                <p className="text-base font-semibold text-slate-900 dark:text-white leading-tight truncate">
                  {L('Ahmed Cooling', 'أحمد للتبريد')}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span className="text-[11px] font-semibold uppercase text-blue-700 dark:text-blue-400">
                    {L('Admin Panel', 'لوحة التحكم')}
                  </span>
                </div>
              </div>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label={L('Close menu', 'إغلاق القائمة')}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white lg:hidden"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto" aria-label={L('Main', 'الرئيسية')}>
          {NAV_ITEMS.map(({ href, en, ar, icon: Icon }) => {
            const active = isActivePath(pathname, href);
            const label = L(en, ar);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                aria-label={showLabels ? undefined : label}
                title={showLabels ? undefined : label}
                className={`relative flex min-h-11 items-center gap-3 px-3 rounded-xl text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                  collapsed && !mobileOpen ? 'lg:justify-center' : ''
                } ${
                  active
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-800/60 hover:text-blue-700 dark:hover:text-white'
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${active ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} aria-hidden="true" />
                {showLabels && <span className="truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2 shrink-0">
          <Link
            href="/"
            target="_blank"
            rel="noopener"
            aria-label={showLabels ? undefined : L('View website (opens in a new tab)', 'عرض الموقع (في تبويب جديد)')}
            className={`flex min-h-11 items-center gap-3 px-3 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 ${
              collapsed && !mobileOpen ? 'lg:justify-center' : ''
            }`}
          >
            <ExternalLink className="w-4 h-4 shrink-0" aria-hidden="true" />
            {showLabels && <span>{L('View website', 'عرض الموقع')}</span>}
          </Link>

          <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-semibold flex items-center justify-center text-xs shrink-0" aria-hidden="true">
                {String(displayName)[0]?.toUpperCase()}
              </div>
              {showLabels && (
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate" dir="auto">{displayName}</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate" dir="ltr">{user?.email || L('Administrator', 'مسؤول')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Collapse (desktop only) */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? L('Expand sidebar', 'توسيع الشريط الجانبي') : L('Collapse sidebar', 'طي الشريط الجانبي')}
            aria-expanded={!collapsed}
            aria-controls="admin-sidebar"
            className="hidden lg:flex w-full min-h-10 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50 items-center justify-center text-xs gap-1.5"
          >
            <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180 rtl:rotate-0' : 'rtl:rotate-180'}`} aria-hidden="true" />
            {!collapsed && <span>{L('Collapse', 'طي')}</span>}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-300 ${collapsed ? 'lg:ps-20' : 'lg:ps-64'}`}>
        <header className="sticky top-0 z-30 h-16 bg-white/90 dark:bg-[#0F172A]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-3 sm:px-6 flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label={L('Open menu', 'فتح القائمة')}
              aria-expanded={mobileOpen}
              aria-controls="admin-sidebar"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
              {L(NAV_ITEMS.find((n) => isActivePath(pathname, n.href))?.en || 'Admin', NAV_ITEMS.find((n) => isActivePath(pathname, n.href))?.ar || 'لوحة التحكم')}
            </p>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <LangToggle />
            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label={themeLabel}
              title={themeLabel}
              aria-pressed={isDarkMode}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 pointer-coarse:h-11 pointer-coarse:w-11"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={() => setConfirmLogout(true)}
              aria-label={L('Sign out', 'تسجيل الخروج')}
              className="inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-xl px-2.5 sm:px-3 text-sm font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 pointer-coarse:h-11 pointer-coarse:min-w-11"
            >
              <LogOut className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} aria-hidden="true" />
              <span className="hidden sm:inline">{L('Sign out', 'خروج')}</span>
            </button>
          </div>
        </header>

        {/* Pages must not add their own outer padding: the layout provides it */}
        <main id="admin-main" tabIndex={-1} className="flex-1 w-full max-w-[1750px] mx-auto min-w-0 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 outline-none">
          {children}
        </main>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        title={L('Sign out?', 'تسجيل الخروج؟')}
        message={L('You will need to sign in again to use the admin panel.', 'ستحتاج إلى تسجيل الدخول مرة أخرى لاستخدام لوحة التحكم.')}
        confirmLabel={L('Sign out', 'تسجيل الخروج')}
        cancelLabel={L('Stay signed in', 'البقاء')}
        tone="danger"
        onConfirm={() => logout()}
        onClose={() => setConfirmLogout(false)}
      />
    </div>
  );
}

export default function AdminLayout({ children }) {
  return (
    <AdminLangProvider>
      <AdminRoot>
        <AdminToastProvider>
          <AdminAuthProvider>
            <AdminTitleProvider>
              <AdminShell>{children}</AdminShell>
            </AdminTitleProvider>
          </AdminAuthProvider>
        </AdminToastProvider>
      </AdminRoot>
    </AdminLangProvider>
  );
}
