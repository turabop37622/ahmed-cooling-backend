'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Snowflake, Mail, Phone, Eye, EyeOff, Lock, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../contexts/TranslationContext';
import { loginEmail, loginPhone } from '../../lib/api';

const COUNTRY_CODES = [
  { code: '+966', label: '🇸🇦 +966', phonePlaceholder: '5XXXXXXXX', regex: /^5\d{8}$/ },
];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t, language } = useTranslation();

  const [tab, setTab] = useState('email');
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phonePassword, setPhonePassword] = useState('');
  const [showPhonePassword, setShowPhonePassword] = useState(false);
  const [countryIdx, setCountryIdx] = useState(0);
  const [ccOpen, setCcOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const country = COUNTRY_CODES[countryIdx];

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) return setError(t.valEmailRequired);
    if (!/\S+@\S+\.\S+/.test(email)) return setError(t.valInvalidEmail);
    if (!password) return setError(t.valPasswordRequired);

    setLoading(true);
    try {
      const response = await loginEmail(email, password);
      login(response);
      router.push('/');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.error;
      if (msg?.toLowerCase().includes('verify') || msg?.toLowerCase().includes('verified')) {
        setError(t.authMsgVerifyEmailFirst);
      } else {
        setError(msg || t.authMsgLoginFailed);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!phoneNumber.trim()) return setError(t.valPhoneRequired);
    if (!country.regex.test(phoneNumber)) {
      return setError(country.code === '+92' ? t.valPhonePk : t.valPhoneSa);
    }
    if (!phonePassword) return setError(t.valPhonePasswordRequired);

    setLoading(true);
    try {
      const fullPhone = country.code + phoneNumber;
      const response = await loginPhone(fullPhone, phonePassword);
      login(response);
      router.push('/');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.error;
      setError(msg || t.authMsgLoginFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=506685890879-rcuen5qa0bom1f4asc89ah29k8ernt59.apps.googleusercontent.com&redirect_uri=${encodeURIComponent(window.location.origin + '/login')}&response_type=token&scope=email%20profile&prompt=select_account`;
      
      const popup = window.open(googleAuthUrl, 'Google Sign In', 'width=500,height=600,scrollbars=yes');
      
      const checkPopup = setInterval(async () => {
        try {
          if (!popup || popup.closed) {
            clearInterval(checkPopup);
            setLoading(false);
            return;
          }
          const popupUrl = popup.location.href;
          if (popupUrl.includes('access_token=')) {
            clearInterval(checkPopup);
            const hash = popupUrl.split('#')[1];
            const params = new URLSearchParams(hash);
            const accessToken = params.get('access_token');
            popup.close();

            const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            const googleUser = await userInfoRes.json();

            const { socialAuth } = await import('../../lib/api');
            const response = await socialAuth({
              email: googleUser.email,
              fullName: googleUser.name,
              provider: 'google',
            });
            login(response);
            router.push('/');
          }
        } catch {}
      }, 500);
    } catch (err) {
      setError(err?.response?.data?.message || 'Google login failed');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-100 px-4 pt-12 pb-24 sm:px-8 lg:px-16 xl:px-24 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/30 mb-4">
            <Snowflake className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{t.brandName}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t.brandTagline}</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-blue-900/5 border border-slate-200/60 dark:border-slate-700 p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white text-center mb-6">{t.login}</h2>

          {/* Tabs */}
          <div className="flex bg-slate-100 dark:bg-slate-700 rounded-xl p-1 mb-6">
            <button
              onClick={() => { setTab('email'); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                tab === 'email'
                  ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Mail className="w-4 h-4 shrink-0" />
              {t.email}
            </button>
            <button
              onClick={() => { setShowComingSoon(true); setTimeout(() => setShowComingSoon(false), 2500); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                tab === 'phone'
                  ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Phone className="w-4 h-4 shrink-0" />
              {t.phone}
            </button>
          </div>

          {/* Coming Soon */}
          {showComingSoon && (
            <div className="flex items-center justify-center gap-2 p-3 mb-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 animate-pulse">
              <span className="text-lg">🚀</span>
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
                {language === 'ar' ? 'قريباً! تسجيل الدخول بالهاتف سيتوفر قريباً.' : 'Coming Soon! Phone login will be available soon.'}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 mb-5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Email Tab */}
          {tab === 'email' && (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t.email}</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t.password}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-12 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="text-right">
                <Link href="/forgot-password" size="sm" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">{t.forgotPassword}</Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                {t.login}
              </button>
            </form>
          )}

          {/* Phone Tab - Coming Soon */}

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-600" />
            <span className="text-sm text-slate-400 dark:text-slate-500">{t.authOr}</span>
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-600" />
          </div>

          {/* Google */}
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 dark:hover:bg-slate-600 transition shadow-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 001 12c0 1.94.46 3.77 1.18 5.07l3.66-2.84v-.14z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {t.continueWithGoogle}
          </button>

          {/* Sign Up link */}
          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
            {t.dontHaveAccount}{' '}
            <Link href="/signup" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
              {t.signup}
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-6">© 2026 {t.brandName}</p>
      </div>
    </div>
  );
}
