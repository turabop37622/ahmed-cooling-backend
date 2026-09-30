'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { translations } from '../lib/translations';

const TranslationContext = createContext(null);

export const TranslationProvider = ({ children }) => {
  const [language, setLang] = useState('ar');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('language');
      if (saved === 'en' || saved === 'ar') {
        setLang(saved);
      } else {
        setLang('ar');
      }
      const lang = saved === 'en' ? 'en' : 'ar';
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.lang = lang;
    } catch {}
  }, []);

  const setLanguage = (lang) => {
    setLang(lang);
    localStorage.setItem('language', lang);
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  };

  const t = translations[language] || translations.en;
  const isRTL = language === 'ar';

  const toAr = (val) => {
    if (language !== 'ar') return String(val);
    return String(val).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  };

  const formatPrice = (amount, currency = 'SAR') => {
    const num = Number(amount || 0);
    const currUpper = String(currency || 'SAR').toUpperCase();
    if (language === 'ar') {
      const formatted = num.toLocaleString();
      const arNum = formatted.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
      const symbol = 'ر.س';
      return `${arNum} ${symbol}`;
    }
    return `${currUpper} ${num.toLocaleString()}`;
  };

  return (
    <TranslationContext.Provider value={{ t, language, isRTL, setLanguage, toAr, formatPrice }}>
      {children}
    </TranslationContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context) throw new Error('useTranslation must be used within TranslationProvider');
  return context;
};
