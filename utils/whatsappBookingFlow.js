// Lets a customer book a service entirely over WhatsApp: a short, deterministic step-by-step chat (pick a
// service -> date -> time -> address -> confirm) rather than free-form AI extraction, so the data that actually
// becomes a booking is always validated the same way the app/website validate it.
//
// Reuses the real booking-creation logic (routes/bookings.js: createBookingForPhone) — same pricing, emails,
// auto-assignment and admin notification as a booking made in the app.
const Service = require('../models/Service');
const WhatsAppConversation = require('../models/WhatsAppConversation');
const { sendTextMessage } = require('./whatsappCloud');
const { logMessage } = require('./whatsappConversationStore');
const { isBookableDate, isIsoDate, riyadhDate, addDays, normalizeTime } = require('./schedule');
const bookingsRouter = require('../routes/bookings');

let catalogueServices = [];
try { catalogueServices = require('../web/src/lib/services.json'); } catch { catalogueServices = []; }
// Package catalogue entries carry their own fixed price (visit fee included) and are not real Service documents.
const isPackage = (item) => item.isPackage === true;

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

const reply = async (phone, text) => {
  await sendTextMessage(phone, text);
  await logMessage(phone, 'out', text, { messageType: 'text', sentBy: 'bot' });
};

const serviceListText = (isAr) => {
  const lines = catalogueServices.slice(0, 25).map((s, i) =>
    `${i + 1}. ${isAr && s.nameAr ? s.nameAr : s.name} — ${L(isAr, 'from', 'يبدأ من')} SAR ${s.basePrice}`);
  return `${L(isAr, 'Which service would you like to book? Reply with the number:', 'ما الخدمة التي تريد حجزها؟ الرجاء الرد برقمها:')}\n\n${lines.join('\n')}`;
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
const handleMessage = async (phone, text, conversation) => {
  const isAr = conversation?.customerName ? looksArabic(conversation.customerName) : looksArabic(text);
  const draft = conversation?.bookingDraft;

  if (draft?.step) {
    if (CANCEL_RE.test(text)) {
      await setDraft(phone, null);
      await reply(phone, L(isAr, 'Okay, no booking made. Let me know if you\'d like to start again.', 'تم، لم يتم إنشاء أي حجز. أخبرنا إذا أردت البدء من جديد.'));
      return true;
    }
    await advanceDraft(phone, text, draft, isAr);
    return true;
  }

  if (!BOOKING_INTENT_RE.test(text)) return false;

  if (!catalogueServices.length) {
    await reply(phone, L(isAr, 'Sorry, bookings aren\'t available right now — please use our app or website.', 'عذراً، الحجز غير متاح الآن — الرجاء استخدام التطبيق أو الموقع.'));
    return true;
  }

  await setDraft(phone, { step: 'service' });
  await reply(phone, serviceListText(isAr));
  return true;
};

const advanceDraft = async (phone, text, draft, isAr) => {
  if (draft.step === 'service') {
    const n = parseInt(text.trim(), 10);
    const item = Number.isInteger(n) ? catalogueServices[n - 1] : null;
    if (!item) {
      await reply(phone, L(isAr, 'Please reply with just the number of the service from the list above.', 'الرجاء الرد برقم الخدمة من القائمة أعلاه فقط.'));
      return;
    }
    await setDraft(phone, { step: 'date', serviceId: String(item._id), serviceName: item.name, serviceNameAr: item.nameAr || item.name });
    await reply(phone, L(isAr,
      'Great. What date would you like? Reply "today", "tomorrow", a day like "30", "30/11", or a full date like 2026-11-05.',
      'ممتاز. ما التاريخ المناسب؟ أرسل "اليوم" أو "غداً" أو يوم مثل "30" أو "30/11" أو تاريخ كامل مثل 2026-11-05.'));
    return;
  }

  if (draft.step === 'date') {
    const date = parseDate(text);
    if (!date || !isBookableDate(date)) {
      await reply(phone, L(isAr,
        'That date doesn\'t work — please reply "today", "tomorrow", a day like "30" or "30/11", within the next 60 days.',
        'هذا التاريخ غير متاح — الرجاء إرسال "اليوم" أو "غداً" أو يوم مثل "30" أو "30/11" خلال 60 يوماً القادمة.'));
      return;
    }
    await setDraft(phone, { ...draft, step: 'time', date });
    await reply(phone, L(isAr,
      'What time works for you? e.g. "10:00 AM", "4 PM", "1pm", or "Anytime".',
      'ما الوقت المناسب؟ مثال: "10:00 صباحاً" أو "4 مساءً" أو "في أي وقت".'));
    return;
  }

  if (draft.step === 'time') {
    const time = normalizeTime(loosenTime(text.trim())) || (/anytime|أي\s*وقت/i.test(text) ? 'Anytime' : null);
    if (!time) {
      await reply(phone, L(isAr,
        'I didn\'t understand that time — try something like "10:00 AM", "1pm", or "Anytime".',
        'لم أفهم هذا الوقت — جرّب مثل "10:00 صباحاً" أو "أي وقت".'));
      return;
    }
    await setDraft(phone, { ...draft, step: 'address', time });
    await reply(phone, L(isAr, 'What is the full address for the visit? (area, street and building/landmark)', 'ما هو العنوان الكامل للزيارة؟ (الحي والشارع والمبنى أو أقرب معلم)'));
    return;
  }

  if (draft.step === 'address') {
    const address = text.trim().slice(0, 300);
    if (address.length < 12 || !/\s/.test(address)) {
      await reply(phone, L(isAr,
        'That\'s too short for a technician to find you — please include the area, street, and building/landmark.',
        'هذا العنوان غير كافٍ لوصول الفني — الرجاء ذكر الحي والشارع والمبنى أو أقرب معلم.'));
      return;
    }
    const confirmed = { ...draft, step: 'confirm', address };
    await setDraft(phone, confirmed);
    const serviceLabel = isAr ? confirmed.serviceNameAr : confirmed.serviceName;
    await reply(phone, L(isAr,
      `Please confirm:\n• Service: ${serviceLabel}\n• Date: ${confirmed.date}\n• Time: ${confirmed.time}\n• Address: ${address}\n\nReply YES to confirm, NO to cancel, or CHANGE to pick different details.`,
      `الرجاء التأكيد:\n• الخدمة: ${serviceLabel}\n• التاريخ: ${confirmed.date}\n• الوقت: ${confirmed.time}\n• العنوان: ${address}\n\nأرسل "نعم" للتأكيد أو "لا" للإلغاء أو "تغيير" لاختيار تفاصيل مختلفة.`));
    return;
  }

  if (draft.step === 'confirm') {
    const t = text.trim();
    if (/\b(yes|yeah|yep|confirm|ok|okay)\b/i.test(t) || /نعم|أكيد|اكيد|تأكيد|موافق/.test(t)) {
      await createFromDraft(phone, draft, isAr);
      return;
    }
    if (/\b(no|nope|cancel)\b/i.test(t) || /^لا\b|إلغاء|الغاء/.test(t)) {
      await setDraft(phone, null);
      await reply(phone, L(isAr, 'Okay, no booking made.', 'تم، لم يتم إنشاء أي حجز.'));
      return;
    }
    if (/\b(change|edit|redo|restart)\b/i.test(t) || /تغيير|تعديل|غير/.test(t)) {
      await setDraft(phone, { step: 'service' });
      await reply(phone, serviceListText(isAr));
      return;
    }
    await reply(phone, L(isAr,
      'Please reply YES to confirm, NO to cancel, or CHANGE to start over and pick different details.',
      'الرجاء الرد بـ "نعم" للتأكيد أو "لا" للإلغاء أو "تغيير" للبدء من جديد باختيار تفاصيل مختلفة.'));
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

module.exports = { handleMessage };
