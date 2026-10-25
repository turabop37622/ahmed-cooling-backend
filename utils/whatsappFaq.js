// Instant (no AI call) answers to the questions customers ask most, in English and Arabic.
//
// Why it exists: every message that reaches the AI fallback (utils/whatsappChatbot.js) costs a network round trip
// to Groq — 1-3 seconds when it's healthy, nothing at all when it's rate-limited — and many customers write in at
// once. The common questions below are matched with plain regular expressions and answered straight away; only
// what doesn't match here goes to the AI.
//
// Every fact in these replies comes from something the business already shows customers (the app's service
// screen, the catalogue in web/src/lib/services.json, the visit fee in VISIT_CHARGE) — nothing here is invented.
// To add or reword an answer, edit REPLIES / INTENTS below; no other file needs to change.
let catalogue = [];
try { catalogue = require('../web/src/lib/services.json'); } catch { catalogue = []; }

const VISIT_FEE = (() => {
  const n = Number(process.env.VISIT_CHARGE);
  return Number.isFinite(n) && n >= 0 ? n : 30;
})();
const PHONE = '+966 54 448 3745';
const WEBSITE = 'www.ahmedcoolingworkshop.com';

// Lower-case, Arabic letter variants unified (ة->ه, أإآ->ا, ى->ي), diacritics/tatweel/punctuation removed.
const normalize = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[ً-ٰٟـ]/g, '')
  .replace(/ة/g, 'ه').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي')
  .replace(/[^\p{L}\p{N}\s/]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tokensOf = (norm) => (norm ? norm.split(' ') : []);

// ---------- greetings / thanks / language ----------
const GREETING = new Set(['hi', 'hii', 'hello', 'helo', 'hey', 'hola', 'salam', 'salaam', 'assalam', 'assalamualaikum', 'assalamu', 'alaikum', 'alikum', 'aslam', 'aslamo', 'aoa', 'slm', 'walaikum', 'walikum', 'menu', 'start', 'help', 'good',
  'السلام', 'سلام', 'مرحبا', 'مرحبتين', 'اهلا', 'اهلين', 'هلا', 'هلو', 'هاي', 'صباح', 'مساء', 'قايمه', 'القايمه', 'ابدا', 'مساعده']);
const THANKS = new Set(['thanks', 'thank', 'thx', 'thankyou', 'shukriya', 'shukria', 'jazakallah', 'jazak', 'شكرا', 'شكرن', 'مشكور', 'مشكوره', 'جزاك', 'يعطيك', 'تسلم']);
const FILLER = new Set(['o', 'wa', 'dear', 'sir', 'madam', 'team', 'there', 'all', 'everyone', 'brother', 'bro', 'bhai', 'ji', 'jee', 'g', 'sahab', 'morning', 'evening', 'afternoon', 'night', 'how', 'are', 'you',
  'what', 's', 'up', 'kya', 'haal', 'hai', 'aap', 'very', 'much', 'so', 'a', 'lot', 'allah', 'khair', 'khairan', 'ok', 'okay', 'again', 'the', 'for', 'your', 'help', 'please',
  'عليكم', 'ورحمه', 'الله', 'وبركاته', 'وعليكم', 'اخي', 'حياك', 'كيف', 'حالك', 'خير', 'جميعا', 'فريق', 'كثير', 'الف', 'يعافيك', 'عليك', 'لك']);

const allTokensIn = (tokens, ...sets) => tokens.length > 0 && tokens.every((t) => sets.some((s) => s.has(t)));
const anyTokenIn = (tokens, set) => tokens.some((t) => set.has(t));

// "My inverter problem", "AC is not cooling", "meri fridge cooling nahi kar rahi", "المكيف لا يبرد": the customer is describing
// something that is wrong, so it is a conversation (the AI), not a service choice or a price card.
const PROBLEM_RE = /\b(problem|issue|not\s*(working|cooling|starting|turning|running)|broken|stopped|noise|noisy|leak|leaking|fault|trouble|smell|burning|kharab|masla|mushkil|nahi|nahin|band|garam|shor|awaaz|tapak|pani)\b|(مشكل|عطل|خراب|تعطل|لا\s*يعمل|ما\s*يشتغل|لا\s*يبرد|ما\s*يبرد|تسريب|صوت|يسرب|مايبرد|ما\s*تبرد|لا\s*تبرد|ما\s*تشتغل)/i;

const isGreeting = (norm) => {
  const tokens = tokensOf(norm);
  return tokens.length <= 6 && anyTokenIn(tokens, GREETING) && allTokensIn(tokens, GREETING, FILLER);
};
const isThanks = (norm) => {
  const tokens = tokensOf(norm);
  return tokens.length <= 6 && anyTokenIn(tokens, THANKS) && allTokensIn(tokens, THANKS, FILLER);
};

// 'en' | 'ar' | 'ask' (they mentioned language but not which) | null (not about language)
const languageRequest = (norm) => {
  if (!/\b(english|arabic|urdu|language|lang)\b|عربي|عربيه|انجليزي|انجليزيه|لغه|اللغه/.test(norm)) return null;
  const wantsAr = /\barabic\b|عربي|عربيه/.test(norm);
  const wantsEn = /\benglish\b|انجليزي|انجليزيه/.test(norm);
  if (wantsAr && !wantsEn) return 'ar';
  if (wantsEn && !wantsAr) return 'en';
  return 'ask';
};

// ---------- which question is this? (checked top to bottom, first hit wins) ----------
const INTENTS = [
  ['cancel_change', /\b(cancel|reschedule|postpone)\b|change (my )?(booking|appointment|time|date|slot)|الغاء|تاجيل|تغيير (ال)?موعد|تعديل (ال)?(حجز|موعد)/],
  ['status', /my booking (status|details|time)|booking status|status of (my|the)|where is (my|the) (technician|tech|engineer)|technician (status|location)|track (my|the)|order status|meri booking ka|booking ka status|technician kahan|حجزي|حاله (حجزي|الحجز|الطلب)|وين الفني|فين الفني|اين الفني|موعدي|طلبي/],
  ['visit_fee', /visit(ing)? (fee|charge|cost)|inspection (fee|charge)|diagnos(is|tic) (fee|charge)|رسوم (ال)?زياره|سعر (ال)?زياره|تكلفه (ال)?زياره|رسوم (ال)?كشف/],
  ['prices', /\b(price|prices|pricing|cost|costs|rate|rates|charges?|how much|kitna|kitne|qeemat|kimat)\b|سعر|اسعار|تكلف|بكم|كم تاخذون|كم يكلف|بكام/],
  ['how_to_book', /how (do|can|to|should) (i |we )?(book|make a booking|order)|ways? to book|طريقه (ال)?حجز|كيف (ا)?(احجز|الحجز|اطلب)|كيفيه (ال)?حجز|booking kaise|kaise book/],
  ['warranty', /warrant|guarantee|ضمان|گارنٹی/],
  ['payment', /\b(pay|paying|payment|payments|cash|card|advance|deposit|installments?|vat|tax|spare parts?)\b|دفع|كاش|نقدا|بطاقه|مقدم|عربون|ضريبه|قطع غيار|ادفع/],
  ['arrival', /(how (long|soon|fast)|when will).{0,30}(arrive|come|reach|technician|tech)|\b(eta|arrival)\b|كم (يوصل|ياخذ|تاخذ)|متي (يوصل|ياتي|يجي|تصلون)|technician kab/],
  ['hours', /\b(hours?|timings?|timing|open|opening|closing|24\/7|24 hours|emergency|urgent|urgently|working time)\b|ساعات (ال)?(عمل|دوام)|دوام|اوقات|مفتوح|طواري|طاري|عاجل|24 ساعه|على مدار/],
  ['areas', /(which|what|any) (areas?|cit(y|ies)|locations?|neighbou?rhoods?)|do you (serve|cover|operate)|service areas?|coverage|\bareas\b|مناطق|مدن|تخدمون|تغطون|تغطيه|وين تخدمون|فين تخدمون/],
  ['contact', /contact|phone number|(your|the) number|call (you|us)|website|e-?mail|رقم (ال)?(هاتف|تواصل|جوال|واتس)|رقمكم|اتصال|الاتصال|تواصل|موقعكم|الموقع الالكتروني|ايميل|بريد/],
  ['services_overview', /(what|which|kind of|types? of).{0,20}services?|your services?|services you|do you (offer|provide)|what do you (offer|do|repair|fix|provide)|what can you|list of services|\bservices\b|kia kia|konsi|kon si|apke pas|ماذا تقدمون|ايش (تقدمون|عندكم|الخدمات)|وش (تقدمون|عندكم|خدماتكم)|شو (تقدمون|عندكم|خدماتكم)|خدماتكم|خدماتنا|الخدمات|ما هي (ال)?خدمات/],
];

const matchIntent = (norm) => {
  for (const [id, re] of INTENTS) if (re.test(norm)) return id;
  return null;
};

// ---------- service lookup ("how much is AC repair", "do you fix washing machines") ----------
// What a customer may type -> the words the catalogue's English names use.
const SYNONYMS = {
  ac: ['ac', 'a/c', 'aircon', 'airconditioner', 'conditioner', 'split', 'مكيف', 'مكيفات', 'مكيفي', 'تكييف', 'تكيف', 'سبلت'],
  washing: ['washing', 'washer', 'laundry', 'غساله', 'غسالات', 'غسالتي'],
  refrigerator: ['refrigerator', 'fridge', 'fridges', 'freezer', 'ثلاجه', 'ثلاجات', 'ثلاجتي', 'فريزر', 'براد'],
  microwave: ['microwave', 'ميكروويف', 'ميكرويف'],
  oven: ['oven', 'stove', 'cooker', 'فرن', 'موقد', 'طباخ', 'بوتاجاز'],
  ups: ['ups', 'inverter', 'انفرتر'],
  electrical: ['electrical', 'electric', 'electrician', 'wiring', 'كهرباء', 'كهربائي', 'اسلاك', 'تمديدات'],
  dispenser: ['dispenser', 'موزع', 'دسبنسر'],
  gas: ['gas', 'refill', 'فريون', 'غاز', 'تعبئه', 'شحن'],
  cleaning: ['cleaning', 'clean', 'wash', 'تنظيف', 'غسيل'],
  installation: ['install', 'installation', 'installing', 'تركيب', 'تركيبات'],
  shifting: ['shifting', 'shift', 'relocation', 'relocate', 'moving', 'نقل'],
  compressor: ['compressor', 'كمبروسر', 'ضاغط', 'كومبريسر'],
  pcb: ['pcb', 'board', 'لوحه', 'كرت', 'بورد'],
  thermostat: ['thermostat', 'ترموستات'],
  diagnostic: ['diagnostic', 'diagnosis', 'inspection', 'checkup', 'فحص', 'كشف', 'تشخيص'],
  villa: ['villa', 'annual', 'contract', 'فيلا', 'فلل', 'سنوي', 'سنويه', 'عقد'],
  summer: ['summer', 'prep', 'صيف', 'صيفي', 'تجهيز'],
  central: ['central', 'مركزي', 'مركزيه'],
  maintenance: ['maintenance', 'صيانه'],
  repair: ['repair', 'fix', 'fixing', 'اصلاح', 'تصليح', 'تصلحون', 'تصلح', 'repairing'],
};
const SYNONYM_OF = new Map();
for (const [canonical, list] of Object.entries(SYNONYMS)) for (const w of list) SYNONYM_OF.set(w, canonical);

// "الغسالة" -> "غساله", "refrigerators" -> "refrigerator", "للمكيف" -> "مكيف"
const canonicalFor = (token) => {
  const candidates = [token];
  if (/^[a-z]{4,}s$/.test(token)) candidates.push(token.slice(0, -1));
  const noArticle = token.replace(/^(وال|بال|كال|فال|لل|ال)/, '');
  if (noArticle !== token && noArticle.length >= 2) candidates.push(noArticle);
  for (const c of candidates) if (SYNONYM_OF.has(c)) return SYNONYM_OF.get(c);
  return null;
};

const WEAK = new Set(['repair']); // counts for less than a real subject word, so "AC repair" ranks "AC Repair" first
const NAME_STOP = new Set(['service', 'services', 'visit', 'and', 'full', 'home', 'top', 'up', 'plan', 'water', 'care', 'the', 'of', 'for']);

const nameTokens = (service) => new Set(
  tokensOf(normalize(service.name))
    .map((t) => (t === 'fridge' ? 'refrigerator' : t === 'freezer' ? 'refrigerator' : t === 'wash' ? 'cleaning' : t === 'refill' ? 'gas' : t))
    .filter((t) => t && !NAME_STOP.has(t))
);
const SERVICE_INDEX = catalogue.map((service) => ({ service, tokens: nameTokens(service) }));

// Services the text is about, best match first (at most `limit`). [] if it mentions none.
const findServices = (norm, limit = 5) => {
  const wanted = new Set();
  for (const t of tokensOf(norm)) {
    const canonical = canonicalFor(t);
    if (canonical) wanted.add(canonical);
  }
  // "a/c" survives normalize() because "/" is kept for "24/7"
  if (/\ba\/c\b/.test(norm)) wanted.add('ac');
  if (wanted.size === 0) return [];
  // The only thing mentioned is "repair"/"maintenance"-type filler — not a service
  if ([...wanted].every((w) => w === 'repair')) return [];

  const scored = SERVICE_INDEX.map(({ service, tokens }) => {
    let score = 0;
    for (const w of wanted) {
      if (!tokens.has(w)) continue;
      score += WEAK.has(w) ? 0.5 : 1;
    }
    return { service, score };
  }).filter((x) => x.score > 0);
  if (!scored.length) return [];
  const top = Math.max(...scored.map((x) => x.score));
  return scored
    .filter((x) => x.score >= top)
    .sort((a, b) => (Number(!!b.service.isPopular) - Number(!!a.service.isPopular)) || (a.service.basePrice - b.service.basePrice))
    .slice(0, limit)
    .map((x) => x.service);
};

// ---------- reply texts ----------
const L = (lang, en, ar) => (lang === 'ar' ? ar : en);
const arDuration = (d) => String(d || '').replace(/hours?/i, 'ساعات').replace(/Annual Contract/i, 'عقد سنوي').replace(/(\d)-(\d)/, '$1-$2');
const serviceName = (s, lang) => (lang === 'ar' && s.nameAr ? s.nameAr : s.name);

const serviceLine = (s, lang, detailed) => {
  const base = `${serviceName(s, lang)} — ${L(lang, `from SAR ${s.basePrice}`, `يبدأ من ${s.basePrice} ريال`)}`;
  if (!detailed) return `• ${base}`;
  const bits = [];
  if (s.estimatedDuration) bits.push(L(lang, `about ${s.estimatedDuration}`, `المدة حوالي ${arDuration(s.estimatedDuration)}`));
  if (s.warrantyDays) bits.push(L(lang, `${s.warrantyDays}-day warranty`, `ضمان ${s.warrantyDays} يوم`));
  if (s.isPackage) bits.push(L(lang, 'visit included', 'الزيارة مشمولة'));
  return `• ${base}${bits.length ? ` (${bits.join(L(lang, ', ', '، '))})` : ''}`;
};

const PRICE_NOTE = (lang) => L(lang,
  `A technician visit fee of SAR ${VISIT_FEE} applies (packages already include it). The final price is confirmed after inspection, prices include 15% VAT, and spare parts are extra.`,
  `تُضاف رسوم زيارة الفني ${VISIT_FEE} ريال (والباقات تشمل الزيارة). السعر النهائي يُؤكد بعد المعاينة، والأسعار تشمل ضريبة 15% وقطع الغيار غير مشمولة.`);

const servicesOverview = (lang) => {
  const popular = catalogue.filter((s) => s.isPopular);
  const rest = catalogue.filter((s) => !s.isPopular);
  const lines = [...popular, ...rest].slice(0, 9).map((s) => serviceLine(s, lang, false));
  return `${L(lang, 'Here are some of our services:', 'بعض خدماتنا:')}\n${lines.join('\n')}\n\n${L(lang,
    `Starting prices — a visit fee of SAR ${VISIT_FEE} applies and the final price is confirmed after inspection.`,
    `الأسعار تبدأ من — تُضاف رسوم زيارة ${VISIT_FEE} ريال ويُؤكد السعر النهائي بعد المعاينة.`)}`;
};

const serviceReply = (services, lang) => {
  const lines = services.map((s) => serviceLine(s, lang, true));
  return `${lines.join('\n')}\n\n${PRICE_NOTE(lang)}`;
};

const warrantyRange = () => {
  const days = catalogue.map((s) => s.warrantyDays).filter((d) => d && d < 365);
  return days.length ? [Math.min(...days), Math.max(...days)] : [7, 60];
};

const REPLIES = {
  thanks: (lang) => L(lang, 'You\'re welcome! Let us know if you need anything else.', 'العفو! أخبرنا إذا احتجت أي شيء آخر.'),
  areas: (lang) => L(lang, 'We currently serve Jeddah and Makkah only.', 'نخدم حالياً مدينتي جدة ومكة فقط.'),
  hours: (lang) => L(lang,
    'Our emergency support line runs 24/7, every day. You can book a technician visit here anytime and we\'ll confirm the slot.',
    'خط الدعم الطارئ يعمل على مدار الساعة طوال أيام الأسبوع. يمكنك حجز زيارة فني هنا في أي وقت وسنؤكد الموعد.'),
  payment: (lang) => L(lang,
    'You pay only after the service is done. The final price is confirmed after the technician\'s inspection; prices include 15% VAT and spare parts are extra.',
    'الدفع بعد إتمام الخدمة فقط. السعر النهائي يُؤكد بعد معاينة الفني؛ الأسعار تشمل ضريبة 15% وقطع الغيار غير مشمولة.'),
  visit_fee: (lang) => L(lang,
    `A technician visit fee of SAR ${VISIT_FEE} is added to the service price (fixed-price packages already include it), and it is paid after the service too.`,
    `تُضاف رسوم زيارة الفني ${VISIT_FEE} ريال إلى سعر الخدمة (والباقات ثابتة السعر تشمل الزيارة)، وتُدفع بعد الخدمة أيضاً.`),
  warranty: (lang) => {
    const [min, max] = warrantyRange();
    return L(lang,
      `All work comes with an official certified warranty — usually ${min} to ${max} days depending on the service (the Annual Villa Care plan covers a full year).`,
      `جميع الأعمال مشمولة بضمان رسمي معتمد — عادةً من ${min} إلى ${max} يوماً حسب الخدمة (وخطة العناية السنوية للفلل تغطي سنة كاملة).`);
  },
  arrival: (lang) => L(lang,
    'A certified technician typically arrives within about 60–90 minutes. After you book, we confirm your slot and assign a technician.',
    'يصل الفني المعتمد عادةً خلال 60–90 دقيقة تقريباً. بعد الحجز نؤكد الموعد ونعيّن فنياً.'),
  how_to_book: (lang) => L(lang,
    'You can book right here in WhatsApp — tap "Book a service" below — or through our app or website.',
    'يمكنك الحجز مباشرة هنا في واتساب — اضغط «حجز خدمة» أدناه — أو عبر التطبيق أو الموقع.'),
  cancel_change: (lang) => L(lang,
    'To cancel or change a booking, open My Bookings in the app, or tap "Talk to our team" below and we\'ll help you.',
    'لإلغاء الحجز أو تعديله، افتح «حجوزاتي» في التطبيق، أو اضغط «تحدث مع فريقنا» أدناه وسنساعدك.'),
  contact: (lang) => L(lang,
    `You can reach us right here on WhatsApp (${PHONE}) or at ${WEBSITE}. Emergency support runs 24/7.`,
    `يمكنك التواصل معنا هنا على واتساب (${PHONE}) أو عبر ${WEBSITE}. الدعم الطارئ متاح على مدار الساعة.`),
  contact_menu: (lang) => L(lang,
    `Reach us right here on WhatsApp (${PHONE}) or at ${WEBSITE}. Our emergency support line runs 24/7, every day.`,
    `تواصل معنا هنا على واتساب (${PHONE}) أو عبر ${WEBSITE}. خط الدعم الطارئ يعمل على مدار الساعة طوال أيام الأسبوع.`),
};

module.exports = {
  normalize, tokensOf, PROBLEM_RE, isGreeting, isThanks, languageRequest, matchIntent, findServices,
  servicesOverview, serviceReply, REPLIES, PRICE_NOTE, VISIT_FEE,
};
