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

// Parses "1", "today"/"اليوم", "tomorrow"/"غدا"/"بكرة", or a YYYY-MM-DD date.
const parseDate = (text) => {
  const s = text.trim().toLowerCase();
  if (/^(today|اليوم)$/i.test(s)) return riyadhDate();
  if (/^(tomorrow|غدا|غداً|بكرة)$/i.test(s)) return addDays(riyadhDate(), 1);
  if (isIsoDate(s)) return s;
  return null;
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
      'Great. What date would you like? Reply "today", "tomorrow", or a date like 2026-11-05.',
      'ممتاز. ما التاريخ المناسب؟ أرسل "اليوم" أو "غداً" أو تاريخ مثل 2026-11-05.'));
    return;
  }

  if (draft.step === 'date') {
    const date = parseDate(text);
    if (!date || !isBookableDate(date)) {
      await reply(phone, L(isAr,
        'That date doesn\'t work — please reply "today", "tomorrow", or a date within the next 60 days like 2026-11-05.',
        'هذا التاريخ غير متاح — الرجاء إرسال "اليوم" أو "غداً" أو تاريخ خلال 60 يوماً القادمة مثل 2026-11-05.'));
      return;
    }
    await setDraft(phone, { ...draft, step: 'time', date });
    await reply(phone, L(isAr,
      'What time works for you? e.g. "10:00 AM", "4 PM", or "Anytime".',
      'ما الوقت المناسب؟ مثال: "10:00 صباحاً" أو "4 مساءً" أو "في أي وقت".'));
    return;
  }

  if (draft.step === 'time') {
    const time = normalizeTime(text.trim()) || (/anytime|أي\s*وقت/i.test(text) ? 'Anytime' : null);
    if (!time) {
      await reply(phone, L(isAr,
        'I didn\'t understand that time — try something like "10:00 AM" or "Anytime".',
        'لم أفهم هذا الوقت — جرّب مثل "10:00 صباحاً" أو "أي وقت".'));
      return;
    }
    await setDraft(phone, { ...draft, step: 'address', time });
    await reply(phone, L(isAr, 'What is the address for the visit?', 'ما هو عنوان الزيارة؟'));
    return;
  }

  if (draft.step === 'address') {
    const address = text.trim().slice(0, 300);
    if (address.length < 3) {
      await reply(phone, L(isAr, 'Please send a full address for the technician to find you.', 'الرجاء إرسال العنوان الكامل حتى يصل الفني إليك.'));
      return;
    }
    const confirmed = { ...draft, step: 'confirm', address };
    await setDraft(phone, confirmed);
    const serviceLabel = isAr ? confirmed.serviceNameAr : confirmed.serviceName;
    await reply(phone, L(isAr,
      `Please confirm:\n• Service: ${serviceLabel}\n• Date: ${confirmed.date}\n• Time: ${confirmed.time}\n• Address: ${address}\n\nReply YES to confirm or NO to cancel.`,
      `الرجاء التأكيد:\n• الخدمة: ${serviceLabel}\n• التاريخ: ${confirmed.date}\n• الوقت: ${confirmed.time}\n• العنوان: ${address}\n\nأرسل "نعم" للتأكيد أو "لا" للإلغاء.`));
    return;
  }

  if (draft.step === 'confirm') {
    if (/^(yes|y|confirm)$/i.test(text.trim()) || /^(نعم|أكيد|اكيد)$/i.test(text.trim())) {
      await createFromDraft(phone, draft, isAr);
      return;
    }
    if (/^(no|n|cancel)$/i.test(text.trim()) || /^(لا)$/i.test(text.trim())) {
      await setDraft(phone, null);
      await reply(phone, L(isAr, 'Okay, no booking made.', 'تم، لم يتم إنشاء أي حجز.'));
      return;
    }
    await reply(phone, L(isAr, 'Please reply YES to confirm or NO to cancel.', 'الرجاء الرد بـ "نعم" للتأكيد أو "لا" للإلغاء.'));
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
