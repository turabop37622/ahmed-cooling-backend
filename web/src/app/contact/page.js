'use client';

import { useTranslation } from '@/contexts/TranslationContext';
import {
  Clock,
  Mail,
  MapPin,
  Phone,
  X,
} from 'lucide-react';

export default function ContactPage() {
  const { t, isRTL, language } = useTranslation();

  return (
    <div
      className="min-h-[60vh] bg-bg pb-16 pt-10 dark:bg-slate-950"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="mx-auto max-w-[1560px] space-y-16 px-4 pt-14 sm:px-6 lg:px-8">
        {/* Contact */}
        <section id="contact">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-8 w-1 shrink-0 rounded-full bg-primary dark:bg-blue-500" />
            <h1 className="text-3xl font-black text-text dark:text-white">{t.contactInformation}</h1>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <a
              href={`tel:${t.aboutContactPhoneValue.replace(/\s/g, '')}`}
              className="flex gap-4 rounded-2xl border border-border bg-white p-5 transition-colors hover:border-primary/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500/50"
            >
              <Phone className="h-6 w-6 shrink-0 text-primary dark:text-blue-400" aria-hidden />
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-sub dark:text-slate-500">
                  {t.phone}
                </p>
                <p className="mt-1 text-lg font-semibold text-text dark:text-white">{t.aboutContactPhoneValue}</p>
              </div>
            </a>
            <a
              href={`mailto:${t.aboutContactEmailValue}`}
              className="flex gap-4 rounded-2xl border border-border bg-white p-5 transition-colors hover:border-primary/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500/50"
            >
              <Mail className="h-6 w-6 shrink-0 text-primary dark:text-blue-400" aria-hidden />
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-sub dark:text-slate-500">
                  {t.email}
                </p>
                <p className="mt-1 text-lg font-semibold text-text dark:text-white">{t.aboutContactEmailValue}</p>
              </div>
            </a>
            <div className="flex gap-4 rounded-2xl border border-border bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <MapPin className="h-6 w-6 shrink-0 text-primary dark:text-blue-400" aria-hidden />
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-sub dark:text-slate-500">
                  {t.location}
                </p>
                <p className="mt-1 text-lg font-semibold text-text dark:text-white">{t.aboutContactAddressValue}</p>
              </div>
            </div>
            <div className="flex gap-4 rounded-2xl border border-border bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <Clock className="h-6 w-6 shrink-0 text-primary dark:text-blue-400" aria-hidden />
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-sub dark:text-slate-500">
                  {t.hours}
                </p>
                <p className="mt-1 text-lg font-semibold text-text dark:text-white">{t.aboutContactHoursValue}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Message Form */}
        <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-10 border border-border dark:border-slate-800 shadow-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-black text-text dark:text-white mb-2">
              {language === 'ar' ? 'أرسل لنا رسالة' : 'Send us a Message'}
            </h2>
            <p className="text-sub dark:text-slate-400">
              {language === 'ar' ? 'نحن هنا لمساعدتك. املأ النموذج وسنعود إليك في أقرب وقت.' : 'We are here to help. Fill out the form and we will get back to you.'}
            </p>
          </div>
          <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); alert(language === 'ar' ? 'تم إرسال الرسالة بنجاح!' : 'Message sent successfully!'); e.target.reset(); }}>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t.name || (language === 'ar' ? 'الاسم' : 'Name')}</label>
                <input type="text" required placeholder={t.namePlaceholder || ''} className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t.phone || (language === 'ar' ? 'رقم الهاتف' : 'Phone')}</label>
                <input type="tel" required placeholder="+966 5XX XXX XXX" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary transition-all" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {language === 'ar' ? 'الرسالة' : 'Message'}
              </label>
              <textarea required rows="4" placeholder={language === 'ar' ? 'كيف يمكننا مساعدتك؟' : 'How can we help you?'} className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"></textarea>
            </div>
            <button type="submit" className="w-full sm:w-auto px-8 py-3 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:bg-primary-dark transition-all">
              {language === 'ar' ? 'إرسال الرسالة' : 'Send Message'}
            </button>
          </form>
        </section>

        {/* Follow Us */}
        <section className="pb-4">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-8 w-1 shrink-0 rounded-full bg-primary dark:bg-blue-500" />
            <h2 className="text-2xl font-black text-text dark:text-white">{t.followUs}</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://www.facebook.com/profile.php?id=61589456784736"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-5 py-3 text-sm font-bold text-text transition-colors hover:border-primary hover:bg-primary-light dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:border-blue-500 dark:hover:bg-slate-800"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
              {t.facebook}
            </a>
            <a
              href="https://www.instagram.com/ahmedcoolingworkshop/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-5 py-3 text-sm font-bold text-text transition-colors hover:border-primary hover:bg-primary-light dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:border-blue-500 dark:hover:bg-slate-800"
            >
              <svg className="h-5 w-5 text-primary dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
              {t.instagram}
            </a>
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-5 py-3 text-sm font-bold text-text transition-colors hover:border-primary hover:bg-primary-light dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:border-blue-500 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5 text-primary dark:text-blue-400" aria-hidden />
              {t.twitter}
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
