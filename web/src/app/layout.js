import { Plus_Jakarta_Sans, IBM_Plex_Sans_Arabic, Tajawal } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "../contexts/ThemeContext";
import { TranslationProvider } from "../contexts/TranslationContext";
import { AuthProvider } from "../contexts/AuthContext";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import WhatsAppButton from "../components/WhatsAppButton";
import ScrollObserver from "../components/ScrollObserver";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-ibm-plex-arabic",
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic"],
  weight: ["300", "400", "500", "700", "800", "900"],
  display: "swap",
});

export const metadata = {
  metadataBase: new URL('https://www.ahmedcoolingworkshop.com'),
  title: {
    default: 'ورشة أحمد للتبريد | صيانة مكيفات وأجهزة منزلية جدة ومكة | Ahmed Cooling Workshop KSA',
    template: '%s | Ahmed Cooling Workshop',
  },
  description: 'ورشة أحمد للتبريد - صيانة وإصلاح المكيفات (سبليت، شباك، مركزي) والأجهزة المنزلية بجدة ومكة. خدمة طوارئ 24/7. Trusted AC repair in Jeddah & Makkah for residents & expats.',
  keywords: [
    // Saudi Arabic Primary Keywords
    'ورشة أحمد للتبريد', 'صيانة مكيفات جدة', 'تصليح مكيفات مكة', 'فني مكيفات اسبليت جدة',
    'غسيل مكيفات جدة', 'تنظيف مكيفات مكة', 'تعبئة فريون مكيف جدة', 'صيانة أجهزة منزلية جدة',
    'إصلاح ثلاجات جدة', 'إصلاح غسالات مكة', 'فني تكييف مركزي جدة', 'صيانة تكييف مكة المكرمة',
    'شركة صيانة مكيفات بجدة', 'خدمة طوارئ تكييف 24 ساعة', 'تصليح أجهزة منزلية مكة',
    // English Keywords for Expats Living in Saudi Arabia
    'Ahmed Cooling Workshop', 'AC repair Jeddah', 'AC repair Makkah', 'air conditioner repair Saudi Arabia',
    'certified AC technician Jeddah', 'split AC maintenance Jeddah', 'AC deep cleaning Jeddah',
    'AC gas refill KSA', 'refrigerator repair Jeddah', 'washing machine repair Makkah',
    'emergency AC repair Jeddah', 'appliance repair Jeddah', 'HVAC technician Jeddah',
    'home appliance maintenance Saudi Arabia', 'central AC maintenance Makkah', 'freon leak fix Jeddah',
  ],
  icons: {
    icon: '/logo-icon.png',
    shortcut: '/logo-icon.png',
    apple: '/logo-icon.png',
  },
  openGraph: {
    type: 'website',
    locale: 'ar_SA',
    alternateLocale: ['en_US', 'en_GB'],
    url: 'https://www.ahmedcoolingworkshop.com',
    title: 'ورشة أحمد للتبريد | صيانة مكيفات وأجهزة منزلية جدة ومكة | Ahmed Cooling Workshop KSA',
    description: 'ورشة أحمد للتبريد - صيانة وإصلاح المكيفات والأجهزة المنزلية في جدة ومكة المكرمة. خدمة طوارئ 24/7 مع فنيين مؤهلين وضمان رسمي معتمد.',
    siteName: 'Ahmed Cooling Workshop - ورشة أحمد للتبريد',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ورشة أحمد للتبريد | Ahmed Cooling Workshop KSA',
    description: 'ورشة أحمد للتبريد - صيانة وإصلاح المكيفات والأجهزة المنزلية في جدة ومكة المكرمة. خدمة طوارئ 24/7 مع ضمان معتمد.',
  },
  alternates: {
    canonical: 'https://www.ahmedcoolingworkshop.com',
    languages: {
      'ar-SA': 'https://www.ahmedcoolingworkshop.com',
      'en-SA': 'https://www.ahmedcoolingworkshop.com',
      'x-default': 'https://www.ahmedcoolingworkshop.com',
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  verification: {
    google: 'google2c7ef9c93df45db9',
  },
  other: {
    'geo.region': 'SA',
    'geo.placename': 'Jeddah, Saudi Arabia',
    'geo.position': '21.4858;39.1925',
    'ICBM': '21.4858, 39.1925',
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="ar"
      className={`${plusJakartaSans.variable} ${ibmPlexArabic.variable} ${tajawal.variable} h-full`}
      translate="no"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Almarai:wght@300;400;700;800&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&family=Tajawal:wght@300;400;500;700;800;900&display=swap"
          rel="stylesheet"
        />
        {/* Prevent dark mode flash — runs before React hydration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem('darkMode')==='true'){document.documentElement.classList.add('dark')}}catch(e){}})();`,
          }}
        />
        <meta name="google" content="notranslate" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': ['LocalBusiness', 'HVACBusiness'],
              name: 'Ahmed Cooling Workshop - ورشة أحمد للتبريد',
              alternateName: 'Ahmed Cooling Workshop KSA',
              description: 'ورشة أحمد للتبريد - صيانة وإصلاح المكيفات (سبليت وشباك ومركزي)، الثلاجات والغسالات في جدة ومكة المكرمة. خدمة طوارئ 24/7 مع ضمان رسمي معتمد وقطع غيار أصلية.',
              disambiguatingDescription: 'Professional air conditioning and home appliance repair workshop in Saudi Arabia serving customers across Jeddah and Makkah.',
              url: 'https://www.ahmedcoolingworkshop.com',
              telephone: '+966590192146',
              email: 'ahmedcoolingworkshop@gmail.com',
              knowsLanguage: ['ar', 'en'],
              address: {
                '@type': 'PostalAddress',
                addressLocality: 'Jeddah',
                addressRegion: 'Makkah Province',
                addressCountry: 'SA',
              },
              geo: {
                '@type': 'GeoCoordinates',
                latitude: 21.4858,
                longitude: 39.1925,
              },
              areaServed: [
                { '@type': 'City', name: 'Jeddah', '@id': 'https://www.wikidata.org/wiki/Q5880' },
                { '@type': 'City', name: 'Makkah', '@id': 'https://www.wikidata.org/wiki/Q5806' },
                { '@type': 'Country', name: 'Saudi Arabia' },
              ],
              serviceType: [
                'AC Repair', 'AC Installation', 'AC Deep Cleaning', 'AC Gas Refill',
                'Refrigerator Repair', 'Washing Machine Repair', 'Freezer Repair',
                'Stove & Oven Repair', 'Microwave Repair', 'Electrical Wiring',
                'Central AC Service', 'General Maintenance', 'Emergency AC Repair',
              ],
              openingHoursSpecification: {
                '@type': 'OpeningHoursSpecification',
                dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                opens: '00:00',
                closes: '23:59',
              },
              priceRange: 'SAR 100 - SAR 2000',
              sameAs: [
                'https://wa.me/966590192146',
                'https://www.instagram.com/ahmedcoolingworkshop/',
                'https://www.facebook.com/profile.php?id=61589456784736',
              ],
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Service',
              serviceType: 'HVAC and Home Appliance Repair Services in Saudi Arabia',
              provider: {
                '@type': 'LocalBusiness',
                name: 'Ahmed Cooling Workshop - ورشة أحمد للتبريد',
                telephone: '+966590192146',
              },
              areaServed: [
                { '@type': 'City', name: 'Jeddah' },
                { '@type': 'City', name: 'Makkah' },
              ],
              hasOfferCatalog: {
                '@type': 'OfferCatalog',
                name: 'AC & Appliance Repair Services - خدمات صيانة المكيفات والأجهزة',
                itemListElement: [
                  { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'AC Repair & Diagnostics - إصلاح وصيانة المكيفات' } },
                  { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'AC Installation & Dismantling - فك وتركيب المكيفات' } },
                  { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'AC Deep Jet Wash Cleaning - غسيل وتنظيف عميق للمكيفات' } },
                  { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'AC Freon Gas Refill - تعبئة وشحن فريون أصلي' } },
                  { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Refrigerator & Freezer Repair - صيانة الثلاجات والفريزر' } },
                  { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Washing Machine Repair - صيانة وإصلاح الغسالات' } },
                ],
              },
            }),
          }}
        />
        {/* TikTok Pixel Code */}
        <Script
          id="tiktok-pixel"
          strategy="lazyOnload"
          dangerouslySetInnerHTML={{
            __html: `
              !function (w, d, t) {
                w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for( var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script") ;n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
                ttq.load('D7UA7P3C77U0A0BNDM3G');
                ttq.page();
              }(window, document, 'ttq');
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#F0F4FF] text-[#0F172A] dark:bg-[#0F172A] dark:text-[#F1F5F9] antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <TranslationProvider>
            <AuthProvider>
              <Navbar />
              <ScrollObserver />
              <main className="flex-1">{children}</main>
              <Footer />
              <WhatsAppButton />
            </AuthProvider>
          </TranslationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
