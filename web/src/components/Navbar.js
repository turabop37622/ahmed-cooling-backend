'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Sun, Moon, User, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../contexts/TranslationContext';

export default function Navbar() {
  const pathname = usePathname();
  const { user, token, logout } = useAuth();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { t, language, setLanguage } = useTranslation();
  const isAr = language === 'ar';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const dropdownRef = useRef(null);

  const isHome = pathname === '/';
  const isDarkHeader = isHome && !scrolled;

  // Scroll detection to switch header from dark to light
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 30);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const navLinks = [
    { href: '/', label: t.home },
    { href: '/services', label: t.services },
    { href: '/about', label: t.aboutUs },
    { href: '/contact', label: language === 'ar' ? 'اتصل بنا' : 'Contact' },
  ];

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'ar' : 'en');
  };

  if (pathname?.startsWith('/admin')) return null;

  return (
    <nav
      className={`${
        isHome ? 'fixed top-0 left-0 right-0' : 'sticky top-0'
      } z-50 transition-all duration-300 ${
        isDarkHeader
          ? 'bg-slate-950/35 backdrop-blur-md border-b border-white/10 shadow-none text-white'
          : 'bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-md border-b border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-white'
      }`}
    >
      <div className="mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center shrink-0 group py-1">
            {isDarkHeader ? (
              <img
                src={isAr ? "/logo-ar-white.png" : "/logo-en-white.png"}
                alt="Ahmed Cooling Workshop"
                className="h-10 sm:h-11 w-auto object-contain transition-transform duration-200 group-hover:scale-[1.02]"
              />
            ) : (
              <>
                <img
                  src={isAr ? "/logo-ar.png" : "/logo-en.png"}
                  alt="Ahmed Cooling Workshop"
                  className="h-10 sm:h-11 w-auto object-contain dark:hidden transition-transform duration-200 group-hover:scale-[1.02]"
                />
                <img
                  src={isAr ? "/logo-ar-white.png" : "/logo-en-white.png"}
                  alt="Ahmed Cooling Workshop"
                  className="h-10 sm:h-11 w-auto object-contain hidden dark:block transition-transform duration-200 group-hover:scale-[1.02]"
                />
              </>
            )}
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              const linkClasses = isDarkHeader
                ? isActive
                  ? 'text-white bg-white/20'
                  : 'text-white/85 hover:text-white hover:bg-white/10'
                : isActive
                  ? 'text-primary bg-primary-light dark:text-blue-400 dark:bg-blue-500/10'
                  : 'text-sub hover:text-primary hover:bg-primary-light dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800';

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${linkClasses}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Right side actions */}
          <div className="hidden md:flex items-center gap-2">
            {/* My Bookings */}
            {token && (
              <Link
                href="/bookings"
                className={`px-4 py-1.5 text-sm font-bold rounded-full transition-colors ${
                  isDarkHeader
                    ? 'bg-white/15 text-white border border-white/25 hover:bg-white/25'
                    : 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20'
                }`}
              >
                {t.myBookings || 'My Bookings'}
              </Link>
            )}

            {/* Language toggle */}
            <button
              onClick={toggleLanguage}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                isDarkHeader
                  ? 'border-white/30 text-white hover:bg-white/10'
                  : 'border-border text-sub hover:text-primary hover:border-primary dark:text-slate-300 dark:border-slate-700 dark:hover:text-white'
              }`}
            >
              {language === 'en' ? 'عربي' : 'EN'}
            </button>

            {/* Theme toggle */}
            <button
              onClick={toggleDarkMode}
              className={`p-2 rounded-lg transition-colors ${
                isDarkHeader
                  ? 'text-white/90 hover:text-white hover:bg-white/10'
                  : 'text-sub hover:text-primary hover:bg-primary-light dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800'
              }`}
              aria-label="Toggle theme"
            >
              {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            {/* Auth */}
            {user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isDarkHeader
                      ? 'text-white hover:bg-white/10'
                      : 'text-text hover:bg-primary-light dark:text-white dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-xs font-bold text-white">
                      {(user.fullName || user.name || 'U').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="max-w-[120px] truncate">{user.fullName || user.name || 'User'}</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-border dark:border-slate-700 py-1 z-50">
                    <Link
                      href="/profile"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-text dark:text-slate-200 hover:bg-primary-light dark:hover:bg-slate-700 transition-colors"
                    >
                      <User className="h-4 w-4" />
                      {t.myProfile}
                    </Link>
                    <hr className="my-1 border-border dark:border-slate-700" />
                    <button
                      onClick={() => { logout(); setDropdownOpen(false); }}
                      className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      {t.logout}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isDarkHeader
                    ? 'bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur-sm'
                    : 'bg-primary hover:bg-primary-dark text-white shadow-sm'
                }`}
              >
                <User className="h-4 w-4" />
                {t.login}
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className={`md:hidden p-2 rounded-lg transition-colors ${
              isDarkHeader
                ? 'text-white hover:bg-white/10'
                : 'text-sub hover:text-primary hover:bg-primary-light dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          className={`md:hidden border-t ${
            isDarkHeader
              ? 'border-white/15 bg-slate-950/95 backdrop-blur-2xl text-white'
              : 'border-border dark:border-slate-700 bg-white dark:bg-slate-900'
          }`}
        >
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isDarkHeader
                    ? 'text-white/90 hover:bg-white/10 hover:text-white'
                    : 'text-text dark:text-slate-200 hover:bg-primary-light dark:hover:bg-slate-800'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {token && (
              <Link
                href="/bookings"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-bold text-center text-white bg-primary hover:bg-primary-dark transition-colors"
              >
                {t.myBookings || 'My Bookings'}
              </Link>
            )}
          </div>

          <div
            className={`px-4 py-3 border-t flex items-center gap-3 ${
              isDarkHeader ? 'border-white/15' : 'border-border dark:border-slate-700'
            }`}
          >
            <button
              onClick={toggleLanguage}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                isDarkHeader
                  ? 'border-white/30 text-white hover:bg-white/10'
                  : 'border-border text-sub dark:text-slate-300 dark:border-slate-700 hover:text-primary hover:border-primary'
              }`}
            >
              {language === 'en' ? 'عربي' : 'EN'}
            </button>
            <button
              onClick={toggleDarkMode}
              className={`p-2 rounded-lg transition-colors ${
                isDarkHeader
                  ? 'text-white/90 hover:bg-white/10'
                  : 'text-sub dark:text-slate-300 hover:text-primary hover:bg-primary-light dark:hover:bg-slate-800'
              }`}
              aria-label="Toggle theme"
            >
              {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>

          <div
            className={`px-4 py-3 border-t ${
              isDarkHeader ? 'border-white/15' : 'border-border dark:border-slate-700'
            }`}
          >
            {user ? (
              <div className="space-y-1">
                <div className="flex items-center gap-3 px-3 py-2">
                  <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-sm font-bold text-white">
                      {(user.fullName || user.name || 'U').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      isDarkHeader ? 'text-white' : 'text-text dark:text-white'
                    }`}
                  >
                    {user.fullName || user.name || 'User'}
                  </span>
                </div>
                <Link
                  href="/profile"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    isDarkHeader
                      ? 'text-white/90 hover:bg-white/10'
                      : 'text-text dark:text-slate-200 hover:bg-primary-light dark:hover:bg-slate-800'
                  }`}
                >
                  <User className="h-4 w-4" />
                  {t.myProfile}
                </Link>

                <button
                  onClick={() => { logout(); setMobileOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  {t.logout}
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isDarkHeader
                    ? 'bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur-sm'
                    : 'bg-primary hover:bg-primary-dark text-white'
                }`}
              >
                <User className="h-4 w-4" />
                {t.login}
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
