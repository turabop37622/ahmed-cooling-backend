'use client';

import Link from 'next/link';
import { Shield, Mail } from 'lucide-react';
import { useTranslation } from '@/contexts/TranslationContext';

export default function PrivacyPage() {
  const { t, isRTL } = useTranslation();
  const email = String(t.aboutContactEmailValue || 'ahmedcoolingworkshop@gmail.com')
    .trim()
    .replace(/\s+/g, '');
  const mailtoHref = `mailto:${email}`;

  const sections = [
    {
      title: t.privacySection1,
      blocks: [
        {
          subtitle: t.privacyPersonalInfo,
          text: t.privacyPersonalInfoText,
          bullets: [
            t.privacyBullet1,
            t.privacyBullet2,
            t.privacyBullet3,
            t.privacyBullet4,
            t.privacyBullet5,
          ],
        },
        {
          subtitle: t.privacyAutoInfo,
          text: t.privacyAutoInfoText,
          bullets: [
            t.privacyBullet6,
            t.privacyBullet7,
            t.privacyBullet8,
            t.privacyBullet9,
          ],
        },
      ],
    },
    {
      title: t.privacySection2,
      blocks: [{ text: t.privacyUseText, bullets: [t.privacyUse1, t.privacyUse2, t.privacyUse3, t.privacyUse4, t.privacyUse5, t.privacyUse6, t.privacyUse7] }],
    },
    {
      title: t.privacySection3,
      blocks: [
        { text: t.privacyShareText },
        {
          bullets: [
            `${t.privacyShareTech}${t.privacyShareTechDesc}`,
            `${t.privacySharePay}${t.privacySharePayDesc}`,
            `${t.privacyShareAnalytics}${t.privacyShareAnalyticsDesc}`,
            `${t.privacyShareLegal}${t.privacyShareLegalDesc}`,
          ],
        },
        { text: t.privacyNoSell },
      ],
    },
    {
      title: t.privacySection4,
      blocks: [
        { text: t.privacySecurityText, bullets: [t.privacySec1, t.privacySec2, t.privacySec3, t.privacySec4] },
        { text: t.privacySecurityNote },
      ],
    },
    {
      title: t.privacySection5,
      blocks: [
        { text: t.privacyRightsText },
        {
          bullets: [
            `${t.privacyRightAccess}${t.privacyRightAccessDesc}`,
            `${t.privacyRightCorrection}${t.privacyRightCorrectionDesc}`,
            `${t.privacyRightDeletion}${t.privacyRightDeletionDesc}`,
            `${t.privacyRightOptout}${t.privacyRightOptoutDesc}`,
            `${t.privacyRightPortability}${t.privacyRightPortabilityDesc}`,
          ],
        },
        { text: t.privacyRightsContact },
      ],
    },
    {
      title: t.privacySection6,
      blocks: [{ text: t.privacyCookiesText }],
    },
    {
      title: t.privacySection7,
      blocks: [{ text: t.privacyChildrenText }],
    },
    {
      title: t.privacySection8,
      blocks: [{ text: t.privacyChangesText }],
    },
    {
      title: t.privacySection9,
      blocks: [{ text: t.privacyContactText }],
    },
  ];

  return (
    <div
      className="min-h-[60vh] bg-bg pb-16 dark:bg-slate-950"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="border-b border-border bg-gradient-to-b from-primary-light/60 to-bg dark:from-slate-900 dark:to-slate-950 dark:border-slate-800">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-8 lg:px-16 xl:px-24">
          <div className="flex flex-col items-center text-center sm:items-start sm:text-start">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-md dark:bg-slate-800">
              <Shield className="h-7 w-7 text-primary dark:text-blue-400" aria-hidden />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-text dark:text-white sm:text-4xl">
              {t.privacyPolicyTitle}
            </h1>
            <p className="mt-3 text-sm font-semibold text-primary dark:text-blue-400">{t.privacyLastUpdated}</p>
          </div>
        </div>
      </div>

      <article className="mx-auto max-w-3xl px-4 pt-10 sm:px-8 lg:px-16 xl:px-24">
        <header className="mb-12 rounded-2xl border border-border bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-xl font-black text-text dark:text-white">{t.privacyWelcome}</h2>
          <p className="mt-4 text-sm leading-relaxed text-sub dark:text-slate-300">{t.privacyIntro}</p>
          <p className="mt-3 text-sm leading-relaxed text-sub dark:text-slate-300">{t.privacyAgree}</p>
        </header>

        <div className="space-y-12">
          {sections.map((section) => (
            <section key={section.title} className="scroll-mt-24">
              <h2 className="border-b border-border pb-2 text-lg font-black text-text dark:border-slate-700 dark:text-white">
                {section.title}
              </h2>
              <div className="mt-4 space-y-4">
                {section.blocks.map((block, i) => (
                  <div key={i}>
                    {block.subtitle && (
                      <h3 className="mb-2 text-sm font-extrabold text-text dark:text-white">{block.subtitle}</h3>
                    )}
                    {block.text && (
                      <p className="text-sm leading-relaxed text-sub dark:text-slate-300">{block.text}</p>
                    )}
                    {block.bullets && block.bullets.length > 0 && (
                      <ul className="mt-3 list-disc space-y-2 ps-5 text-sm leading-relaxed text-sub marker:text-primary dark:text-slate-300 dark:marker:text-blue-400">
                        {block.bullets.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href={mailtoHref}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-primary/25 transition-colors hover:bg-primary-dark dark:bg-blue-600 dark:hover:bg-blue-700 sm:w-auto"
          >
            <Mail className="h-5 w-5" aria-hidden />
            {t.privacyContactBtn}
          </a>
          <Link
            href="/about#contact"
            className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-white px-6 py-3.5 text-sm font-bold text-text transition-colors hover:border-primary dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:hover:border-blue-500 sm:w-auto"
          >
            {t.contactInformation}
          </Link>
        </div>

        <footer className="mt-16 border-t border-border pt-8 text-center dark:border-slate-800">
          <p className="text-xs font-semibold text-sub dark:text-slate-500">{t.privacyFooter}</p>
        </footer>
      </article>
    </div>
  );
}
