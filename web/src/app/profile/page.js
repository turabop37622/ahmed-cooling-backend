'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  User, Mail, Phone, MapPin, Bell, Lock, Settings, Info,
  Shield, Star, LogOut, ChevronRight, Loader2, Edit3, Check, X,
} from 'lucide-react';
import { useTranslation } from '@/contexts/TranslationContext';
import { useAuth } from '@/contexts/AuthContext';
import { updateProfile } from '@/lib/api';

const ACCOUNT_ITEMS = [
  { id: 'bookings', icon: Bell, labelKey: 'myBookings', descKey: 'bookings', href: '/bookings', color: 'text-blue-500' },
];

const GENERAL_ITEMS = [
  { id: 'about', icon: Info, labelKey: 'aboutUs', descKey: 'aboutAhmed', href: '/about', color: 'text-emerald-500' },
  { id: 'privacy', icon: Shield, labelKey: 'privacyPolicy', descKey: 'termsConditions', href: '/privacy', color: 'text-slate-500' },
  { id: 'rate', icon: Star, labelKey: 'rateUs', descKey: 'shareYourFeedback', href: '/rate', color: 'text-yellow-500' },
];

export default function ProfilePage() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const { user, token, loading: authLoading, logout, updateUser } = useAuth();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace('/login');
    }
  }, [authLoading, token, router]);

  useEffect(() => {
    if (user) {
      setFormName(user.fullName || user.name || '');
      setFormPhone(user.phone || '');
      setFormAddress(user.address || '');
    }
  }, [user]);

  const handleSave = async () => {
    if (!formName.trim()) {
      alert(t.nameRequired || 'Name is required');
      return;
    }
    setSaving(true);
    try {
      const res = await updateProfile({
        name: formName.trim(),
        fullName: formName.trim(),
        phone: formPhone.trim(),
        address: formAddress.trim(),
      });
      const updatedUser = res?.user || res?.data || { ...user, fullName: formName.trim(), name: formName.trim(), phone: formPhone.trim(), address: formAddress.trim() };
      updateUser(updatedUser);
      setEditing(false);
      alert(t.profileUpdated || 'Profile updated!');
    } catch {
      alert(t.failedToUpdate || 'Failed to update. Check connection.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-bg dark:bg-slate-950">
        <Loader2 className="h-10 w-10 animate-spin text-primary dark:text-blue-400" />
        <p className="text-sm font-semibold text-sub dark:text-slate-400">{t.loading}</p>
      </div>
    );
  }

  if (!user) return null;

  const displayName = user.fullName || user.name || 'User';
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-bg pb-10 dark:bg-slate-950" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6 lg:px-8">

        {/* Profile Card */}
        <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-8">
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 text-3xl font-black text-white ring-4 ring-white/30 backdrop-blur-sm">
                {initials}
              </div>
              <div className="text-center">
                <h1 className="text-xl font-black text-white">{displayName}</h1>
                <p className="mt-0.5 text-sm text-blue-100">{user.email || ''}</p>
              </div>
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
                {t.activeMember || 'Active Member'}
              </span>
            </div>
          </div>

        </div>

        {/* Edit Profile Form — always visible */}
        <div className="mb-6 space-y-3 rounded-2xl border border-border bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="text-sm font-black text-text dark:text-white mb-1">{t.editProfile || 'Edit Profile'}</h3>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-sub dark:text-slate-400">{t.fullNameLabel || 'Full Name'}</label>
              <div className="relative">
                <User className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-sub dark:text-slate-500" />
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                  className="w-full rounded-xl border border-border py-3 pr-4 pl-10 text-sm font-semibold text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-sub dark:text-slate-400">{t.phoneLabel || 'Phone Number'}</label>
              <div className="relative">
                <Phone className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-sub dark:text-slate-500" />
                <input type="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full rounded-xl border border-border py-3 pr-4 pl-10 text-sm font-semibold text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-sub dark:text-slate-400">{t.addressLabel || 'Address'}</label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-sub dark:text-slate-500" />
                <input type="text" value={formAddress} onChange={(e) => setFormAddress(e.target.value)}
                  className="w-full rounded-xl border border-border py-3 pr-4 pl-10 text-sm font-semibold text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>
            <button onClick={handleSave} disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-black text-white transition hover:bg-primary-dark disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? (t.loading || 'Loading...') : (t.saveChangesBtn || 'Save Changes')}
            </button>
          </div>

        {/* Logout Button */}
        <button onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-red-200 bg-red-50 py-3.5 text-sm font-black text-red-600 transition hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          <LogOut className="h-4.5 w-4.5" />
          {t.logout || 'Logout'}
        </button>

        <div className="mt-3 flex items-center justify-center gap-1.5 pb-4">
          <Shield className="h-3.5 w-3.5 text-emerald-500" />
          <p className="text-[11px] font-semibold text-sub dark:text-slate-500">{t.dataSecure || 'Your data is always secure'}</p>
        </div>
      </div>
    </div>
  );
}

function MenuItem({ item, t, onClick }) {
  const Icon = item.icon;
  return (
    <button onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-white px-4 py-3.5 text-left transition hover:border-primary/30 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500/30"
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 ${item.color}`}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-text dark:text-white">{t[item.labelKey] || item.labelKey}</p>
        <p className="text-xs text-sub dark:text-slate-500">{t[item.descKey] || item.descKey}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
    </button>
  );
}
