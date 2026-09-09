import { Geist } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "../contexts/ThemeContext";
import { TranslationProvider } from "../contexts/TranslationContext";
import { AuthProvider } from "../contexts/AuthContext";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import WhatsAppButton from "../components/WhatsAppButton";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata = {
  metadataBase: new URL('https://www.ahmedcoolingworkshop.com'),
  title: {
    default: 'Ahmed Cooling Workshop | AC Repair & Appliance Service Jeddah Makkah | صيانة مكيفات جدة مكة',
    template: '%s | Ahmed Cooling Workshop',
  },
  description: 'Professional AC repair, installation, deep cleaning & appliance maintenance in Jeddah & Makkah, Saudi Arabia. Refrigerator, washing machine, stove repair. 24/7 emergency service. صيانة وإصلاح المكيفات والأجهزة المنزلية في جدة ومكة المكرمة. خدمة طوارئ ٢٤ ساعة.',
  keywords: [
    'AC repair Jeddah', 'AC repair Makkah', 'air conditioner repair Saudi Arabia',
    'AC installation Jeddah', 'AC deep cleaning', 'AC gas refill Jeddah',
    'refrigerator repair Jeddah', 'washing machine repair Makkah',
    'appliance repair Saudi Arabia', 'HVAC service Jeddah',
    'central AC maintenance', '24/7 emergency AC repair Jeddah',
    'stove repair Makkah', 'freezer repair Jeddah',
    'electrical wiring fix Saudi Arabia', 'home appliance service',
    'صيانة مكيفات جدة', 'إصلاح مكيفات مكة', 'تصليح مكيفات',
    'تنظيف مكيفات جدة', 'صيانة أجهزة منزلية', 'إصلاح ثلاجات جدة',
    'إصلاح غسالات مكة', 'فني مكيفات جدة', 'صيانة مكيفات مكة المكرمة',
    'تعبئة غاز مكيف', 'إصلاح مكيف سبليت', 'صيانة تكييف مركزي',
    'خدمة طوارئ تكييف', 'ورشة أحمد للتبريد',
  ],
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  openGraph: {
    type: 'website',
    locale: 'ar_SA',
    alternateLocale: 'en_US',
    url: 'https://www.ahmedcoolingworkshop.com',
    title: 'Ahmed Cooling Workshop | AC & Appliance Repair Jeddah Makkah',
    description: 'Professional AC repair, installation & appliance maintenance in Jeddah & Makkah. 24/7 emergency service. صيانة مكيفات وأجهزة منزلية جدة ومكة.',
    siteName: 'Ahmed Cooling Workshop - ورشة أحمد للتبريد',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ahmed Cooling Workshop | AC Repair Jeddah & Makkah',
    description: 'Professional AC & appliance repair in Saudi Arabia. 24/7 emergency service.',
  },
  alternates: {
    canonical: 'https://www.ahmedcoolingworkshop.com',
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
    <html lang="ar" className={`${geistSans.variable} h-full`} translate="no" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'LocalBusiness',
              name: 'Ahmed Cooling Workshop - ورشة أحمد للتبريد',
              alternateName: 'ورشة أحمد للتبريد والأجهزة المنزلية',
              description: 'Professional AC repair, installation, deep cleaning & home appliance maintenance in Jeddah & Makkah, Saudi Arabia.',
              url: 'https://www.ahmedcoolingworkshop.com',
              telephone: '+966590192146',
              email: 'info@ahmedcoolingworkshop.com',
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
              ],
              serviceType: [
                'AC Repair', 'AC Installation', 'AC Deep Cleaning', 'AC Gas Refill',
                'Refrigerator Repair', 'Washing Machine Repair', 'Freezer Repair',
                'Stove & Oven Repair', 'Microwave Repair', 'Electrical Wiring',
                'Central AC Service', 'General Maintenance', 'Emergency Repair',
              ],
              openingHoursSpecification: {
                '@type': 'OpeningHoursSpecification',
                dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                opens: '00:00',
                closes: '23:59',
              },
              priceRange: 'SAR 150 - SAR 3000',
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: '4.8',
                reviewCount: '250',
                bestRating: '5',
                reviewCount: '250',
                bestRating: '5',
              },
              sameAs: [
                'https://wa.me/966590192146',
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
              serviceType: 'HVAC and Home Appliance Repair',
              provider: {
                '@type': 'LocalBusiness',
                name: 'Ahmed Cooling Workshop',
              },
              areaServed: {
                '@type': 'Country',
                name: 'Saudi Arabia',
              },
              hasOfferCatalog: {
                '@type': 'OfferCatalog',
                name: 'AC & Appliance Repair Services',
                itemListElement: [
                  { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'AC Repair - إصلاح المكيفات' } },
                  { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'AC Installation - تركيب المكيفات' } },
                  { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'AC Deep Cleaning - تنظيف عميق للمكيفات' } },
                  { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Refrigerator Repair - إصلاح الثلاجات' } },
                  { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Washing Machine Repair - إصلاح الغسالات' } },
                ],
              },
            }),
          }}
        />
        {/* TikTok Pixel Code */}
        <Script
          id="tiktok-pixel"
          strategy="afterInteractive"
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
      <body className="min-h-full flex flex-col bg-[#F0F4FF] text-[#0F172A] dark:bg-[#0F172A] dark:text-[#F1F5F9] antialiased">
        <ThemeProvider>
          <TranslationProvider>
            <AuthProvider>
              <Navbar />
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
