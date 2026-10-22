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
const Service = require('../models/Service');
const WhatsAppConversation = require('../models/WhatsAppConversation');
const { sendTextMessage, sendButtonsMessage, sendListMessage } = require('./whatsappCloud');
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

const L = (isAr, en, ar) => (isAr ? ar : en);

const draftStatus = (phone) => WhatsAppConversation.findOne({ phone }).select('bookingDraft customerName language');

const setDraft = (phone, draft) => WhatsAppConversation.findOneAndUpdate(
  { phone },
  draft ? { $set: { bookingDraft: draft } } : { $unset: { bookingDraft: 1 } },
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
  const m = /^(\d{1,2})\s*([ap])\.?\s*m\.?$/i.exec(text.trim());
  return m ? `${m[1]}:00 ${m[2].toUpperCase()}M` : text;
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

const advanceDraft = async (phone, input, draft, isAr) => {
  if (draft.step === 'service') {
    const m = /^svc_(\d+)$/.exec(input);
    const index = m ? Number(m[1]) : (Number.isInteger(parseInt(input.trim(), 10)) ? parseInt(input.trim(), 10) - 1 : NaN);
    const item = LIST_SERVICES[index];
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
        : normalizeTime(loosenTime(input.trim())) || (/anytime|أي\s*وقت/i.test(input) ? 'Anytime' : null);
    if (!time) {
      await reply(phone, L(isAr,
        'I didn\'t understand that time — please pick one from the list, or type something like "3:30 PM".',
        'لم أفهم هذا الوقت — اختر من القائمة أو اكتب مثل "3:30 PM".'));
      await replyTimeList(phone, isAr, draft.date);
      return;
    }
    await setDraft(phone, { ...draft, step: 'address', time });
    await reply(phone, L(isAr, 'What is the full address for the visit? (area, street and building/landmark)', 'ما هو العنوان الكامل للزيارة؟ (الحي والشارع والمبنى أو أقرب معلم)'));
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
    const confirmed = { ...draft, step: 'confirm', address };
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
  if (draft.step === 'service') await replyServiceList(phone, isAr);
  else if (draft.step === 'date') await replyDateList(phone, isAr);
  else if (draft.step === 'time') await replyTimeList(phone, isAr, draft.date);
  else if (draft.step === 'address') await reply(phone, L(isAr, 'What is the full address for the visit? (area, street and building/landmark)', 'ما هو العنوان الكامل للزيارة؟ (الحي والشارع والمبنى أو أقرب معلم)'));
  else if (draft.step === 'confirm') await replyConfirm(phone, draft, isAr);
};

module.exports = { handleMessage, startFlow, clearDraft, resume };
