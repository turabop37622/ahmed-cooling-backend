// Lets a customer book a service entirely over WhatsApp: a short, deterministic step-by-step chat (pick a
// service -> date -> time -> address -> confirm) rather than free-form AI extraction, so the data that actually
// becomes a booking is always validated the same way the app/website validate it.
//
// Service selection and the final confirm step use WhatsApp's native interactive messages (a tappable list /
// reply buttons) instead of "reply with a number" — only possible because this whole flow only ever runs after
// the customer has messaged us first (Meta's 24h customer-service window), unlike the very first "please
// confirm" nudge in utils/whatsappBookingBot.js, which still has to be an approved template.
//
// Reuses the real booking-creation logic (routes/bookings.js: createBookingForPhone) — same pricing, emails,
// auto-assignment and admin notification as a booking made in the app.
const axios = require('axios');
const Service = require('../models/Service');
const faq = require('./whatsappFaq');
const WhatsAppConversation = require('../models/WhatsAppConversation');
const { sendTextMessage, sendButtonsMessage, sendListMessage, sendLocationRequest } = require('./whatsappCloud');
const { logMessage } = require('./whatsappConversationStore');
const { isBookableDate, isIsoDate, riyadhDate, addDays, normalizeTime, RIYADH_OFFSET_MS } = require('./schedule');
const { normalizeCity } = require('./autoAssign');
const bookingsRouter = require('../routes/bookings');

let catalogueServices = [];
try { catalogueServices = require('../web/src/lib/services.json'); } catch { catalogueServices = []; }
// Package catalogue entries carry their own fixed price (visit fee included) and are not real Service documents.
const isPackage = (item) => item.isPackage === true;

// WhatsApp list messages allow at most 10 rows total — popular services first, then whatever else fits.
const LIST_SERVICES = [
  ...catalogueServices.filter((s) => s.isPopular),
  ...catalogueServices.filter((s) => !s.isPopular),
].slice(0, 10);

const BOOKING_INTENT_RE = /\b(book|booking|schedule|appointment)\b|(احجز|حجز|موعد|اريد\s*حجز|أريد\s*حجز)|(\bbook\s*karna\b|\bbooking\s*karni\b)/i;
const CANCEL_RE = /\b(cancel|stop|nevermind|never mind)\b|(الغاء|إلغاء|لا أريد)|(\bcancel\s*kar\b|\brehnay\s*do\b)/i;
const looksArabic = (text) => /[؀-ۿ]/.test(text);

// Arabic-Indic / Persian digits -> ASCII, so "٣٠" or "٤ م" parse like "30" / "4 pm".
const asciiDigits = (text) => text
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

const L = (isAr, en, ar) => (isAr ? ar : en);

const draftStatus = (phone) => WhatsAppConversation.findOne({ phone }).select('bookingDraft customerName language');

const setDraft = (phone, draft) => WhatsAppConversation.findOneAndUpdate(
  { phone },
  draft ? { $set: { bookingDraft: { ...draft, updatedAt: new Date() } } } : { $unset: { bookingDraft: 1 } },
  { upsert: true, new: true }
);

// Date list: today + the next 8 days, then "Other date" (typed) — 10 rows is WhatsApp's list limit.
const DATE_LIST_DAYS = 9;
const dateRowTitle = (iso, offset, isAr) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const prefix = offset === 0 ? L(isAr, 'Today', 'اليوم') : offset === 1 ? L(isAr, 'Tomorrow', 'غداً') : '';
  // Today/Tomorrow already name the weekday, and the 24-char row-title limit is tight in Arabic.
  const label = d.toLocaleDateString(isAr ? 'ar-SA-u-ca-gregory' : 'en-GB', { ...(prefix ? {} : { weekday: 'short' }), day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (prefix ? `${prefix} · ${label}` : label).slice(0, 24);
};

// Visit windows start on the hour; they are not a promise of a fixed arrival — the technician still calls to agree.
const TIME_SLOTS = ['08:00 AM', '10:00 AM', '12:00 PM', '02:00 PM', '04:00 PM', '06:00 PM', '08:00 PM'];
const slotHour24 = (slot) => {
  const m = /^(\d{2}):\d{2} ([AP])M$/.exec(slot);
  return (Number(m[1]) % 12) + (m[2] === 'P' ? 12 : 0);
};

const reply = async (phone, text) => {
  await sendTextMessage(phone, text);
  await logMessage(phone, 'out', text, { messageType: 'text', sentBy: 'bot' });
};

const replyButtons = async (phone, bodyText, buttons) => {
  await sendButtonsMessage(phone, bodyText, buttons);
  await logMessage(phone, 'out', `${bodyText} [${buttons.map((b) => b.title).join(' / ')}]`, { messageType: 'button', sentBy: 'bot' });
};

const replyDateList = async (phone, isAr) => {
  const today = riyadhDate();
  const rows = Array.from({ length: DATE_LIST_DAYS }, (_, i) => {
    const iso = addDays(today, i);
    return { id: `date_${iso}`, title: dateRowTitle(iso, i, isAr), description: iso };
  });
  rows.push({ id: 'date_other', title: L(isAr, 'Other date', 'تاريخ آخر'), description: L(isAr, 'Type a date, e.g. 30/11', 'اكتب تاريخاً، مثل 30/11') });
  const bodyText = L(isAr, 'Great. Pick a date for the visit:', 'ممتاز. اختر تاريخ الزيارة:');
  await sendListMessage(phone, bodyText, L(isAr, 'Choose date', 'اختر التاريخ'), [{ rows }]);
  await logMessage(phone, 'out', `${bodyText} [list: ${rows.map((r) => r.title).join(', ')}]`, { messageType: 'button', sentBy: 'bot' });
  await replyNav(phone, isAr, 'date');
};

const replyTimeList = async (phone, isAr, date) => {
  const nowHour = new Date(Date.now() + RIYADH_OFFSET_MS).getUTCHours();
  const slots = TIME_SLOTS.filter((t) => date !== riyadhDate() || slotHour24(t) > nowHour);
  const fmt = (t) => (isAr ? t.replace('AM', 'ص').replace('PM', 'م') : t);
  const rows = slots.map((t) => ({ id: `time_${t.replace(/\W/g, '')}`, title: fmt(t) }));
  rows.push({ id: 'time_anytime', title: L(isAr, 'Anytime', 'أي وقت'), description: L(isAr, 'Technician will call to agree', 'سيتصل بك الفني للاتفاق') });
  rows.push({ id: 'time_other', title: L(isAr, 'Other time', 'وقت آخر'), description: L(isAr, 'Type a time, e.g. 3:30 PM', 'اكتب وقتاً، مثل 3:30 PM') });
  const bodyText = L(isAr, 'What time suits you?', 'ما الوقت المناسب لك؟');
  await sendListMessage(phone, bodyText, L(isAr, 'Choose time', 'اختر الوقت'), [{ rows }]);
  await logMessage(phone, 'out', `${bodyText} [list: ${rows.map((r) => r.title).join(', ')}]`, { messageType: 'button', sentBy: 'bot' });
  await replyNav(phone, isAr, 'time');
};

// A list (or location request) can't carry reply buttons itself, so the way out of each step — go back, main menu,
// change language — follows it as a small second message. The first step has nothing to go back to.
const replyNav = async (phone, isAr, step) => {
  const buttons = [];
  if (step !== 'service') buttons.push({ id: 'nav_back', title: L(isAr, '⬅ Back', '⬅ رجوع') });
  buttons.push({ id: 'menu_main', title: L(isAr, '☰ Main menu', '☰ القائمة') });
  buttons.push({ id: 'menu_lang', title: L(isAr, '🌐 Language', '🌐 اللغة') });
  await replyButtons(phone, L(isAr, 'Need to go back or change something?', 'تريد الرجوع أو التغيير؟'), buttons);
};

const replyConfirm = async (phone, d, isAr) => {
  const serviceLabel = isAr ? d.serviceNameAr : d.serviceName;
  await replyButtons(phone,
    L(isAr,
      `Please confirm:\n• Service: ${serviceLabel}\n• Date: ${d.date}\n• Time: ${d.time}\n• Address: ${d.address}`,
      `الرجاء التأكيد:\n• الخدمة: ${serviceLabel}\n• التاريخ: ${d.date}\n• الوقت: ${d.time}\n• العنوان: ${d.address}`),
    [
      { id: 'confirm_yes', title: L(isAr, 'Yes, confirm', 'نعم، أؤكد') },
      { id: 'confirm_change', title: L(isAr, 'Change', 'تغيير') },
      { id: 'confirm_cancel', title: L(isAr, 'No, cancel', 'لا، إلغاء') },
    ]);
};

const replyServiceList = async (phone, isAr) => {
  const bodyText = L(isAr, 'Which service would you like to book?', 'ما الخدمة التي تريد حجزها؟');
  const rows = LIST_SERVICES.map((s, i) => ({
    id: `svc_${i}`,
    title: isAr && s.nameAr ? s.nameAr : s.name,
    description: L(isAr, `From SAR ${s.basePrice}`, `يبدأ من ${s.basePrice} ريال`),
  }));
  await sendListMessage(phone, bodyText, L(isAr, 'View services', 'عرض الخدمات'), [{ rows }]);
  await logMessage(phone, 'out', `${bodyText} [list: ${rows.map((r) => r.title).join(', ')}]`, { messageType: 'button', sentBy: 'bot' });
  await replyNav(phone, isAr, 'service');
};

// A real "year-month-day" only if that calendar date actually exists (isIsoDate round-trips it), else null.
const tryDate = (year, month, day) => {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
};

// Parses "today"/"اليوم", "tomorrow"/"غدا"/"بكرة", a full YYYY-MM-DD date, a bare day-of-month ("30" -> the next
// time that day comes around, this month or next), or "DD/MM" / "DD-MM" (optionally with a year).
const parseDate = (text) => {
  const s = text.trim().toLowerCase();
  if (/^(today|اليوم)$/i.test(s)) return riyadhDate();
  if (/^(tomorrow|غدا|غداً|بكرة)$/i.test(s)) return addDays(riyadhDate(), 1);
  if (isIsoDate(s)) return s;

  const todayIso = riyadhDate();
  const [todayYear, todayMonth] = todayIso.split('-').map(Number);

  let m = /^(\d{1,2})$/.exec(s);
  if (m) {
    const day = Number(m[1]);
    let candidate = tryDate(todayYear, todayMonth, day);
    if (!candidate || candidate < todayIso) {
      const nextMonth = todayMonth === 12 ? 1 : todayMonth + 1;
      const nextYear = todayMonth === 12 ? todayYear + 1 : todayYear;
      candidate = tryDate(nextYear, nextMonth, day) || candidate;
    }
    return candidate && candidate >= todayIso ? candidate : null;
  }

  m = /^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/.exec(s);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : todayYear;
    let candidate = tryDate(year, month, day);
    if (candidate && candidate < todayIso && !m[3]) candidate = tryDate(year + 1, month, day);
    return candidate;
  }

  return null;
};

// "1pm", "1 pm", "10am" (hour only, no minutes) -> "1:00 PM" / "10:00 AM" so schedule.js's normalizeTime accepts it.
const loosenTime = (text) => {
  const t = text.trim().replace(/\s*ص(باحا[ًا]?)?$/, ' AM').replace(/\s*م(ساء[ًا]?)?$/, ' PM');
  const hourOnly = /^(\d{1,2})\s*([ap])\.?\s*m\.?$/i.exec(t);
  if (hourOnly) return `${hourOnly[1]}:00 ${hourOnly[2].toUpperCase()}M`;
  return t.replace(/^(\d{1,2}:\d{2})\s*([ap])\.?\s*m\.?$/i, (all, hm, ap) => `${hm} ${ap.toUpperCase()}M`);
};

// "morning" / "evening"... -> the nearest list slot, so a typed answer still lands on a real choice.
const PART_OF_DAY = [
  [/morning|صباح/i, '10:00 AM'], [/noon|midday|ظهر/i, '12:00 PM'],
  [/afternoon|عصر/i, '02:00 PM'], [/evening|مساء/i, '06:00 PM'], [/night|ليل/i, '08:00 PM'],
];
const partOfDay = (text) => (PART_OF_DAY.find(([re]) => re.test(text)) || [])[1] || null;

// Could this message be an answer to the question that is open (service / date / time / confirm)? A tap, "back", "cancel",
// "change the date", a number, a date or time word all are. "hello" or a sentence about something else is not: the caller
// then talks to the customer instead of repeating "that date doesn't work". The address step takes any text.
const DATE_WORDS = /\b(today|tomorrow|aaj|kal|parso|parson)\b|اليوم|غدا|غداً|بكرة|بكره|بعد\s*غد/i;
const TIME_WORDS = /any\s*time|\b(morning|noon|afternoon|evening|night|subah|dopahar|shaam|raat)\b|اي\s*وقت|أي\s*وقت|صباح|ظهر|عصر|مساء|ليل/i;
const YES_NO_WORDS = /\b(yes|yeah|yep|ok|okay|confirm|no|nope|cancel|change|edit|redo|restart|haan|han|nahi|nahin)\b|نعم|أكيد|اكيد|تأكيد|موافق|لا\b|إلغاء|الغاء|تغيير|تعديل|غير/i;
const looksLikeAnswer = (step, rawInput) => {
  const input = asciiDigits(String(rawInput || '')).trim();
  if (!input) return false;
  if (/^(svc_|date_|time_|confirm_|nav_)/.test(input)) return true;
  if (BACK_RE.test(input) || CANCEL_RE.test(input) || CHANGE_RE.some(([, re]) => re.test(input))) return true;
  switch (step) {
    case 'service': return /^\d+$/.test(input) || faq.findServices(faq.normalize(input)).length > 0;
    case 'date': return /\d/.test(input) || DATE_WORDS.test(input);
    case 'time': return /\d/.test(input) || TIME_WORDS.test(input);
    case 'confirm': return YES_NO_WORDS.test(input);
    default: return true;
  }
};

// Starts the flow if the message looks like a booking request and none is already in progress. Returns true if
// it handled the message (started the flow, or is mid-flow and advanced/re-asked a step), false if this message
// is unrelated and should go to the general FAQ bot instead.
// `input` is either plain typed text, or the `id` of a tapped list row / reply button (see routes/whatsappWebhook.js).
const isArabicFor = (conversation, input) => (conversation?.language
  ? conversation.language === 'ar'
  : conversation?.customerName ? looksArabic(conversation.customerName) : looksArabic(input));

// Begins a fresh booking chat (the menu's "Book a service" button, or a typed booking request).
const startFlow = async (phone, isAr) => {
  if (!LIST_SERVICES.length) {
    await reply(phone, L(isAr, 'Sorry, bookings aren\'t available right now — please use our app or website.', 'عذراً، الحجز غير متاح الآن — الرجاء استخدام التطبيق أو الموقع.'));
    return;
  }
  await setDraft(phone, { step: 'service' });
  await replyServiceList(phone, isAr);
};

const handleMessage = async (phone, input, conversation) => {
  const isAr = isArabicFor(conversation, input);
  const draft = conversation?.bookingDraft;

  if (draft?.step) {
    if (input !== 'confirm_cancel' && CANCEL_RE.test(input)) {
      await setDraft(phone, null);
      await reply(phone, L(isAr, 'Okay, no booking made. Let me know if you\'d like to start again.', 'تم، لم يتم إنشاء أي حجز. أخبرنا إذا أردت البدء من جديد.'));
      return true;
    }
    await advanceDraft(phone, input, draft, isAr);
    return true;
  }

  if (!BOOKING_INTENT_RE.test(input)) return false;

  await startFlow(phone, isAr);
  return true;
};

const BACK_RE = /^(back|go back|previous|رجوع|السابق|ارجع)$/i;
const STEP_ORDER = ['service', 'date', 'time', 'address', 'confirm'];
const PREVIOUS_STEP = { date: 'service', time: 'date', address: 'time', confirm: 'address' };
// "change the time" / "غير التاريخ" -> jump straight back to that step without restarting.
const CHANGE_RE = [
  ['service', /\b(change|edit|wrong)\b.*\b(service)\b|(غير|تغيير|تعديل).*(الخدمة)/i],
  ['date', /\b(change|edit|wrong)\b.*\b(date|day)\b|(غير|تغيير|تعديل).*(التاريخ|اليوم)/i],
  ['time', /\b(change|edit|wrong)\b.*\b(time)\b|(غير|تغيير|تعديل).*(الوقت)/i],
  ['address', /\b(change|edit|wrong)\b.*\b(address|location)\b|(غير|تغيير|تعديل).*(العنوان|الموقع)/i],
];

// Re-sends the question for whatever step the draft is on.
const promptStep = async (phone, draft, isAr) => {
  if (draft.step === 'service') await replyServiceList(phone, isAr);
  else if (draft.step === 'date') await replyDateList(phone, isAr);
  else if (draft.step === 'time') await replyTimeList(phone, isAr, draft.date);
  else if (draft.step === 'address') {
    const body = L(isAr,
      'Where should the technician come? Tap the button to send your current location, or just type the address (area, street and building/landmark).',
      'أين يجب أن يأتي الفني؟ اضغط الزر لإرسال موقعك الحالي، أو اكتب العنوان (الحي والشارع والمبنى أو أقرب معلم).');
    try {
      await sendLocationRequest(phone, body);
      await logMessage(phone, 'out', body + ' [send location button]', { messageType: 'button', sentBy: 'bot' });
    } catch (err) {
      await reply(phone, body);
    }
    await replyNav(phone, isAr, 'address');
  } else if (draft.step === 'confirm') await replyConfirm(phone, draft, isAr);
};

const goToStep = async (phone, draft, step, isAr) => {
  const next = { ...draft, step };
  await setDraft(phone, next);
  await promptStep(phone, next, isAr);
};

const advanceDraft = async (phone, rawInput, draft, isAr) => {
  const input = asciiDigits(rawInput);

  // A tap on an old list/button from an earlier step (or a stale confirm) — just ask the current question again.
  const tappedStep = /^svc_/.test(input) ? 'service' : /^date_/.test(input) ? 'date' : /^time_/.test(input) ? 'time' : /^confirm_/.test(input) ? 'confirm' : null;
  if (tappedStep && tappedStep !== draft.step) {
    await promptStep(phone, draft, isAr);
    return;
  }
  if (!tappedStep) {
    const t = input.trim();
    if ((t === 'nav_back' || BACK_RE.test(t)) && PREVIOUS_STEP[draft.step]) {
      await goToStep(phone, draft, PREVIOUS_STEP[draft.step], isAr);
      return;
    }
    const change = CHANGE_RE.find(([, re]) => re.test(t));
    // Only to a step already answered — jumping ahead would skip questions.
    if (change && STEP_ORDER.indexOf(change[0]) < STEP_ORDER.indexOf(draft.step)) {
      await goToStep(phone, draft, change[0], isAr);
      return;
    }
  }

  if (draft.step === 'service') {
    const m = /^svc_(\d+)$/.exec(input);
    const index = m ? Number(m[1]) : (Number.isInteger(parseInt(input.trim(), 10)) ? parseInt(input.trim(), 10) - 1 : NaN);
    // Also accept the service typed by name ("AC repair", "غسالة") — the first catalogue match that is in the list.
    const typedNorm = faq.normalize(input);
    const looksLikeAName = faq.tokensOf(typedNorm).length <= 4 && !faq.PROBLEM_RE.test(`${input} ${typedNorm}`);
    const byName = m || Number.isInteger(parseInt(input.trim(), 10)) || !looksLikeAName ? null
      : faq.findServices(typedNorm).find((s) => LIST_SERVICES.some((l) => String(l._id) === String(s._id)));
    const item = byName ? LIST_SERVICES.find((l) => String(l._id) === String(byName._id)) : LIST_SERVICES[index];
    if (!item) {
      await reply(phone, L(isAr, 'Please pick a service from the list above.', 'الرجاء اختيار خدمة من القائمة أعلاه.'));
      await replyServiceList(phone, isAr);
      return;
    }
    await setDraft(phone, { step: 'date', serviceId: String(item._id), serviceName: item.name, serviceNameAr: item.nameAr || item.name });
    await replyDateList(phone, isAr);
    return;
  }

  if (draft.step === 'date') {
    if (input === 'date_other') {
      await reply(phone, L(isAr,
        'Type the date, e.g. "30", "30/11" or 2026-11-05.',
        'اكتب التاريخ، مثل "30" أو "30/11" أو 2026-11-05.'));
      return;
    }
    const picked = /^date_(\d{4}-\d{2}-\d{2})$/.exec(input);
    const text = picked ? picked[1] : input === 'date_today' ? 'today' : input === 'date_tomorrow' ? 'tomorrow' : input;
    const date = parseDate(text);
    if (!date || !isBookableDate(date)) {
      await reply(phone, L(isAr,
        'That date doesn\'t work — please pick one from the list, or type a day like "30" or "30/11" within the next 60 days.',
        'هذا التاريخ غير متاح — اختر من القائمة أو اكتب يوماً مثل "30" أو "30/11" خلال 60 يوماً القادمة.'));
      await replyDateList(phone, isAr);
      return;
    }
    await setDraft(phone, { ...draft, step: 'time', date });
    await replyTimeList(phone, isAr, date);
    return;
  }

  if (draft.step === 'time') {
    if (input === 'time_other') {
      await reply(phone, L(isAr,
        'Type the time, e.g. "3:30 PM" or "4pm".',
        'اكتب الوقت، مثل "3:30 PM" أو "4pm".'));
      return;
    }
    const slot = /^time_(\d{2})(\d{2})([AP])M$/.exec(input);
    const time = input === 'time_anytime' ? 'Anytime'
      : slot ? `${slot[1]}:${slot[2]} ${slot[3]}M`
        : normalizeTime(loosenTime(input.trim())) || (/any\s*time|أي\s*وقت|اي\s*وقت|مهما/i.test(input) ? 'Anytime' : partOfDay(input));
    if (!time) {
      await reply(phone, L(isAr,
        'I didn\'t understand that time — please pick one from the list, or type something like "3:30 PM".',
        'لم أفهم هذا الوقت — اختر من القائمة أو اكتب مثل "3:30 PM".'));
      await replyTimeList(phone, isAr, draft.date);
      return;
    }
    const next = { ...draft, step: 'address', time };
    await setDraft(phone, next);
    await promptStep(phone, next, isAr);
    return;
  }

  if (draft.step === 'address') {
    const address = input.trim().slice(0, 300);
    if (address.length < 12 || !/\s/.test(address)) {
      await reply(phone, L(isAr,
        'That\'s too short for a technician to find you — please include the area, street, and building/landmark.',
        'هذا العنوان غير كافٍ لوصول الفني — الرجاء ذكر الحي والشارع والمبنى أو أقرب معلم.'));
      return;
    }
    if (!normalizeCity(address)) {
      await reply(phone, L(isAr,
        'We only serve Jeddah and Makkah — please include the city name in your address (e.g. "..., Jeddah").',
        'نقدم خدماتنا في جدة ومكة فقط — الرجاء ذكر اسم المدينة ضمن العنوان (مثال: "...، جدة").'));
      return;
    }
    const confirmed = { ...draft, step: 'confirm', address, latitude: null, longitude: null };
    await setDraft(phone, confirmed);
    await replyConfirm(phone, confirmed, isAr);
    return;
  }

  if (draft.step === 'confirm') {
    const t = input.trim();
    if (t === 'confirm_yes' || /\b(yes|yeah|yep|confirm|ok|okay)\b/i.test(t) || /نعم|أكيد|اكيد|تأكيد|موافق/.test(t)) {
      await createFromDraft(phone, draft, isAr);
      return;
    }
    if (t === 'confirm_cancel' || /\b(no|nope|cancel)\b/i.test(t) || /^لا\b|إلغاء|الغاء/.test(t)) {
      await setDraft(phone, null);
      await reply(phone, L(isAr, 'Okay, no booking made.', 'تم، لم يتم إنشاء أي حجز.'));
      return;
    }
    if (t === 'confirm_change' || /\b(change|edit|redo|restart)\b/i.test(t) || /تغيير|تعديل|غير/.test(t)) {
      await setDraft(phone, { step: 'service' });
      await replyServiceList(phone, isAr);
      return;
    }
    await reply(phone, L(isAr,
      'Please choose Yes, Change, or No from the buttons above.',
      'الرجاء اختيار نعم أو تغيير أو لا من الأزرار أعلاه.'));
  }
};

const createFromDraft = async (phone, draft, isAr) => {
  try {
    const catalogueItem = catalogueServices.find((s) => String(s._id) === draft.serviceId);
    const serviceRecord = catalogueItem && isPackage(catalogueItem)
      ? catalogueItem
      : await Service.findOne({ _id: draft.serviceId, active: true });
    if (!serviceRecord) {
      await setDraft(phone, null);
      await reply(phone, L(isAr, 'Sorry, that service is no longer available. Please message us again to book.', 'عذراً، هذه الخدمة لم تعد متاحة. الرجاء مراسلتنا مجدداً للحجز.'));
      return;
    }

    const conversation = await draftStatus(phone);
    const booking = await bookingsRouter.createBookingForPhone({
      customerName: conversation?.customerName,
      phone,
      serviceRecord,
      date: draft.date,
      time: draft.time,
      address: draft.address,
      language: isAr ? 'ar' : 'en',
      coordinates: Number.isFinite(draft.latitude) && Number.isFinite(draft.longitude)
        ? { latitude: draft.latitude, longitude: draft.longitude } : undefined,
    });

    await setDraft(phone, null);
    await reply(phone, L(isAr,
      `Your booking is confirmed! Order #${booking.orderNumber}, total SAR ${booking.totalAmount}. We'll see you on ${draft.date} at ${draft.time}.`,
      `تم تأكيد حجزك! رقم الطلب ${booking.orderNumber}، الإجمالي ${booking.totalAmount} ريال. نراكم بتاريخ ${draft.date} الساعة ${draft.time}.`));
  } catch (err) {
    console.error('❌ WhatsApp booking-flow create failed:', err.response?.data || err.message);
    await setDraft(phone, null);
    await reply(phone, L(isAr,
      'Sorry, something went wrong creating your booking. Please try again or use our app.',
      'عذراً، حدث خطأ أثناء إنشاء حجزك. الرجاء المحاولة مرة أخرى أو استخدام التطبيق.'));
  }
};

const clearDraft = (phone) => setDraft(phone, null);

// After the customer interrupted the chat (asked a question, switched language), re-asks whatever step they were on.
const resume = async (phone, isAr) => {
  const conversation = await draftStatus(phone);
  const draft = conversation?.bookingDraft;
  if (!draft?.step) return;
  await reply(phone, L(isAr, 'Let\'s continue your booking:', 'لنكمل حجزك:'));
  await promptStep(phone, draft, isAr);
};

// Greater Jeddah / Makkah bounding boxes — used when a shared pin can't be named by the geocoder.
const cityFromCoords = (lat, lng) => {
  if (lat >= 21.2 && lat <= 21.95 && lng >= 38.95 && lng <= 39.5) return 'Jeddah';
  if (lat >= 21.2 && lat <= 21.6 && lng >= 39.6 && lng <= 40.1) return 'Makkah';
  return null;
};

const reverseGeocode = async (lat, lng, lang) => {
  try {
    const { data } = await axios.get(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=${lang}`, {
      timeout: 6000,
      headers: { 'User-Agent': 'AhmedCoolingWorkshop/1.0' },
    });
    const a = data?.address || {};
    const parts = [a.road || a.pedestrian || a.street, a.neighbourhood || a.suburb || a.quarter, a.city || a.town].filter(Boolean);
    return parts.length ? parts.join(', ') : '';
  } catch {
    return '';
  }
};

// A WhatsApp location pin sent while we're asking for the address. Returns true if it was used (or refused here).
const handleLocation = async (phone, location, conversation) => {
  const draft = conversation?.bookingDraft;
  if (draft?.step !== 'address') return false;
  const isAr = isArabicFor(conversation, '');
  const lat = Number(location?.latitude);
  const lng = Number(location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;

  const named = [location.name, location.address].filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim());
  const geocoded = await reverseGeocode(lat, lng, 'en');
  let address = [...named, geocoded].filter(Boolean).join(', ').slice(0, 300);
  const city = normalizeCity(address) ? null : cityFromCoords(lat, lng);
  if (!normalizeCity(address) && !city) {
    await reply(phone, L(isAr,
      'That pin is outside Jeddah and Makkah, where we work. Please share a location there, or type your address.',
      'هذا الموقع خارج جدة ومكة حيث نعمل. الرجاء مشاركة موقع داخلهما أو كتابة العنوان.'));
    return true;
  }
  if (city) address = [address, city].filter(Boolean).join(', ');
  if (address.length < 12) address = `${address || 'Pinned location'} (${lat.toFixed(5)}, ${lng.toFixed(5)})`;

  const confirmed = { ...draft, step: 'confirm', address, latitude: lat, longitude: lng };
  await setDraft(phone, confirmed);
  await replyConfirm(phone, confirmed, isAr);
  return true;
};

// The draft is dropped if the customer went quiet for a few hours — a stale half-booking must not swallow a new chat.
const DRAFT_TTL_MS = 3 * 60 * 60 * 1000;
const isDraftStale = (draft) => !draft?.updatedAt || Date.now() - new Date(draft.updatedAt).getTime() > DRAFT_TTL_MS;

module.exports = { handleMessage, startFlow, clearDraft, resume, handleLocation, isDraftStale, looksLikeAnswer };
