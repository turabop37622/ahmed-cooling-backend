const SERVICES_META = {
  '1': {
    title: 'AC Repair & Diagnostics in Jeddah & Makkah | صيانة وفحص المكيفات',
    description: 'Certified AC diagnostics and repair for split, window, and central air conditioning in Jeddah & Makkah. Rapid 45-minute dispatch, original spare parts, and 30-day warranty.',
    keywords: ['AC repair Jeddah', 'صيانة مكيفات جدة', 'تصليح مكيفات سبليت مكة', 'فني تكييف جدة', 'AC repair expert technician'],
  },
  '2': {
    title: 'AC Installation & Dismantling in Jeddah & Makkah | تركيب وفك مكيفات سبليت',
    description: 'Professional installation and relocation for split and window air conditioners in Jeddah & Makkah. Precision copper piping, vacuum testing, and guaranteed leak-free operation.',
    keywords: ['AC installation Jeddah', 'تركيب مكيفات سبليت جدة', 'فك وتركيب مكيفات مكة', 'AC moving Jeddah'],
  },
  '3': {
    title: 'AC Deep Cleaning & Sanitization in Jeddah | غسيل وتنظيف مكيفات',
    description: 'High-pressure water bag jet wash and antibacterial sanitization for split and window AC coils in Jeddah & Makkah. Eliminates odors and maximizes cooling power.',
    keywords: ['AC deep cleaning Jeddah', 'غسيل مكيفات جدة', 'تنظيف مكيفات سبليت مكة', 'تعقيم التكييف', 'AC pressure wash Jeddah'],
  },
  '4': {
    title: 'Refrigerator & Freezer Repair in Jeddah & Makkah | إصلاح وصيانة الثلاجات',
    description: 'Fast on-site repair for residential refrigerators and freezers in Jeddah & Makkah. Compressor repair, thermostat replacement, defrost heating, and original freon recharge.',
    keywords: ['refrigerator repair Jeddah', 'صيانة ثلاجات جدة', 'تصليح فريزر مكة', 'فني ثلاجات منزلي', 'fridge repair expat Jeddah'],
  },
  '5': {
    title: 'Washing Machine Repair in Jeddah & Makkah | صيانة وإصلاح الغسالات',
    description: 'Expert same-day repair for automatic and semi-automatic washing machines in Jeddah & Makkah. Spin basket, drum bearings, water pumps, drain valves, and control boards.',
    keywords: ['washing machine repair Jeddah', 'صيانة غسالات جدة', 'تصليح غسالات أوتوماتيك مكة', 'فني غسالات منزلي', 'washer repair Jeddah'],
  },
  '6': {
    title: 'Commercial HVAC & Central AC Maintenance in Jeddah | صيانة التكييف المركزي',
    description: 'Commercial cooling maintenance contracts, packaged units, and ducted split repair for offices, shops, and villas across Jeddah and Makkah.',
    keywords: ['commercial HVAC Jeddah', 'صيانة تكييف مركزي جدة', 'عقود صيانة تكييف مكة', 'central AC service Saudi Arabia'],
  },
};

export async function generateMetadata({ params }) {
  const { id } = await params;
  const meta = SERVICES_META[id] || {
    title: 'Home Appliance & AC Repair Services | Ahmed Cooling Workshop',
    description: 'Professional AC, refrigerator, washing machine, and cooling appliance repair in Jeddah and Makkah.',
    keywords: ['appliance repair Jeddah', 'صيانة أجهزة منزلية جدة', 'ورشة أحمد للتبريد'],
  };

  const canonicalUrl = `https://www.ahmedcoolingworkshop.com/services/${id}`;

  return {
    title: meta.title,
    description: meta.description,
    keywords: meta.keywords,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: canonicalUrl,
      type: 'website',
    },
  };
}

export default function ServiceDetailLayout({ children }) {
  return children;
}
