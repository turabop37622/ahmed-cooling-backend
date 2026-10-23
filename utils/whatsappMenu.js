// The WhatsApp "front door": everything a customer sees before (and around) a booking, built from tappable
// buttons so they type as little as possible.
//
//   first message -> bilingual welcome + [English] [العربية] buttons
//   language chosen -> main menu (a native list: book, services & prices, booking status, areas, contact, a human)
//   a question typed in free text -> an instant canned answer (utils/whatsappFaq.js) with follow-up buttons,
//                                    or, for a booking request, the step-by-step flow (utils/whatsappBookingFlow.js)
//   anything else -> returns false and the caller asks the AI (utils/whatsappChatbot.js)
//
// All of it only runs inside Meta's 24h customer-service window (the customer messaged us first), which is what
// allows interactive messages instead of approved templates.
const Booking = require('../models/Booking');
const WhatsAppConversation = require('../models/WhatsAppConversation');
const { sendTextMessage, sendButtonsMessage, sendListMessage } = require('./whatsappCloud');
const { logMessage, setLanguage } = require('./whatsappConversationStore');
const { phoneVariants } = require('./phone');
const faq = require('./whatsappFaq');
const chatbot = require('./whatsappChatbot');
const bookingFlow = require('./whatsappBookingFlow');

const L = (lang, en, ar) => (lang === 'ar' ? ar : en);
const BODY_MAX = 1000; // WhatsApp allows 1024 characters in an interactive message body
const clamp = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const detectLang = (text) => (/[؀-ۿ]/.test(text) ? 'ar' : 'en');

// ---------- sending (each also writes the admin-inbox log) ----------
const say = async (phone, text) => {
  await sendTextMessage(phone, text);
  await logMessage(phone, 'out', text, { messageType: 'text', sentBy: 'bot' });
};

// Buttons are nicer, but if Meta rejects the interactive message the customer must still get the words.
const sayButtons = async (phone, body, buttons) => {
  const text = clamp(body, BODY_MAX);
  try {
    await sendButtonsMessage(phone, text, buttons);
  } catch {
    await sendTextMessage(phone, text);
  }
  await logMessage(phone, 'out', `${text} [${buttons.map((b) => b.title).join(' / ')}]`, { messageType: 'button', sentBy: 'bot' });
};

const sendLanguagePrompt = async (phone, pendingText) => {
  await WhatsAppConversation.findOneAndUpdate(
    { phone },
    { $set: { languagePromptedAt: new Date(), ...(pendingText ? { pendingText } : {}) }, $setOnInsert: { phone } },
    { upsert: true }
  );
  await sayButtons(
    phone,
    'Welcome to Ahmed Cooling Workshop!\nPlease choose your language.\n\nمرحباً بكم في ورشة أحمد للتبريد!\nالرجاء اختيار اللغة.',
    [{ id: 'lang_en', title: 'English' }, { id: 'lang_ar', title: 'العربية' }]
  );
};

const MENU_ROWS = [
  ['menu_book', ['Book a service', 'حجز خدمة'], ['Schedule a technician visit', 'احجز زيارة فني']],
  ['menu_services', ['Services & prices', 'الخدمات والأسعار'], ['See what we offer', 'تعرف على خدماتنا']],
  ['menu_status', ['My booking status', 'حالة حجزي'], ['Check your latest bookings', 'تحقق من آخر حجوزاتك']],
  ['menu_areas', ['Service areas', 'مناطق الخدمة'], ['Jeddah and Makkah', 'جدة ومكة']],
  ['menu_contact', ['Contact & hours', 'التواصل والدوام'], ['Phone, website, emergency line', 'الهاتف والموقع وخط الطوارئ']],
  ['menu_human', ['Talk to our team', 'تحدث مع فريقنا'], ['Chat with a real person', 'تحدث مع موظف']],
];
// Language is chosen once, from the buttons in the very first message — it is deliberately not a menu row.
// (Typing "english" / "arabic" / "عربي" still switches it; a stale "menu_lang" tap from an older menu still works.)

const sendMainMenu = async (phone, lang, intro) => {
  const body = `${intro ? `${intro}\n\n` : ''}${L(lang,
    'How can we help you today? Tap "Menu" to choose an option.',
    'كيف يمكننا مساعدتك اليوم؟ اضغط «القائمة» لاختيار أحد الخيارات.')}`;
  const rows = MENU_ROWS.map(([id, title, description]) => ({ id, title: L(lang, ...title), description: L(lang, ...description) }));
  try {
    await sendListMessage(phone, clamp(body, BODY_MAX), L(lang, 'Menu', 'القائمة'), [{ rows }]);
  } catch {
    await sendTextMessage(phone, body);
  }
  await logMessage(phone, 'out', `${body} [menu]`, { messageType: 'button', sentBy: 'bot' });
};

const followUp = (lang) => [
  { id: 'menu_book', title: L(lang, 'Book a service', 'حجز خدمة') },
  { id: 'menu_main', title: L(lang, 'Main menu', 'القائمة الرئيسية') },
  { id: 'menu_human', title: L(lang, 'Talk to our team', 'تحدث مع فريقنا') },
];

// An answer, followed by the three things a customer most likely wants next.
const answer = (phone, lang, body) => sayButtons(phone, body, followUp(lang));

// ---------- booking status (read-only lookup by the customer's own WhatsApp number) ----------
const STATUS_TEXT = {
  pending: ['Waiting for confirmation', 'بانتظار التأكيد'],
  confirmed: ['Confirmed', 'مؤكد'],
  assigned: ['Technician assigned', 'تم تعيين فني'],
  on_the_way: ['Technician on the way', 'الفني في الطريق'],
  in_progress: ['Work in progress', 'العمل جارٍ'],
  completed: ['Completed', 'مكتمل'],
  cancelled: ['Cancelled', 'ملغي'],
};

const bookingStatusReply = async (phone, lang) => {
  const bookings = await Booking.find({ phone: { $in: phoneVariants(phone) }, deletedAt: null })
    .sort({ createdAt: -1 }).limit(3).select('orderNumber service serviceDetails date time status');
  if (!bookings.length) {
    await answer(phone, lang, L(lang,
      'We couldn\'t find a booking linked to this WhatsApp number yet. You can book right here with the button below.',
      'لم نجد حجزاً مرتبطاً برقم واتساب هذا بعد. يمكنك الحجز مباشرة من هنا بالزر أدناه.'));
    return;
  }
  const lines = bookings.map((b) => {
    const svc = b.service || {};
    const name = L(lang, svc.name || b.serviceDetails?.name, svc.name_ar || svc.name || b.serviceDetails?.name) || L(lang, 'Service', 'خدمة');
    const status = L(lang, ...(STATUS_TEXT[b.status] || [b.status, b.status]));
    return `• #${b.orderNumber} — ${name}\n   ${[b.date, b.time].filter(Boolean).join(' ')} — ${status}`;
  });
  await answer(phone, lang, `${L(lang, 'Your latest bookings:', 'آخر حجوزاتك:')}\n${lines.join('\n')}`);
};

// ---------- menu taps ----------
const handleMenuId = async (phone, id, conversation, lang) => {
  // Changing language mid-booking keeps the booking (the webhook resumes it after the choice).
  if (id !== 'menu_book' && id !== 'menu_lang' && conversation?.bookingDraft?.step) await bookingFlow.clearDraft(phone);
  switch (id) {
    case 'menu_book': await bookingFlow.startFlow(phone, lang === 'ar'); return true;
    case 'menu_services': await answer(phone, lang, faq.servicesOverview(lang)); return true;
    case 'menu_status': await bookingStatusReply(phone, lang); return true;
    case 'menu_areas': await answer(phone, lang, faq.REPLIES.areas(lang)); return true;
    case 'menu_contact': await answer(phone, lang, faq.REPLIES.contact_menu(lang)); return true;
    case 'menu_human': await chatbot.requestHuman(phone, 'Tapped "Talk to our team"', conversation, lang); return true;
    case 'menu_lang': await sendLanguagePrompt(phone); return true;
    default: await sendMainMenu(phone, lang); return true; // menu_main, or a button we no longer know
  }
};

const GENERIC_HANDLED = ['areas', 'hours', 'payment', 'visit_fee', 'warranty', 'arrival', 'how_to_book', 'cancel_change', 'contact'];

// Returns true if this message was fully answered here, false if the caller should fall back to the AI.
// `input` is either typed text or the id of a tapped button/list row.
const handle = async (phone, input, conversation) => {
  // The customer just chose a language: confirm it, then either answer what they first asked or show the menu.
  if (input === 'lang_en' || input === 'lang_ar') {
    const lang = input === 'lang_ar' ? 'ar' : 'en';
    await setLanguage(phone, lang);
    const pending = conversation?.pendingText;
    if (pending) {
      await WhatsAppConversation.updateOne({ phone }, { $unset: { pendingText: 1 } });
      conversation.language = lang;
      conversation.pendingText = undefined;
      if (await handle(phone, pending, conversation)) return true;
      await chatbot.handleIncomingText(phone, pending, conversation);
      return true;
    }
    await sendMainMenu(phone, lang, L(lang, 'Great — we\'ll continue in English.', 'تمام — سنكمل باللغة العربية.'));
    return true;
  }

  let lang = conversation?.language;
  if (!lang) {
    if (!conversation?.languagePromptedAt) {
      // Remember a real first question so it isn't lost while they pick a language.
      const norm = faq.normalize(input);
      const isQuestion = !input.startsWith('menu_') && norm.length > 3 && !faq.isGreeting(norm) && !faq.isThanks(norm);
      await sendLanguagePrompt(phone, isQuestion ? input : undefined);
      return true;
    }
    lang = detectLang(input); // they ignored the buttons and typed — go by what they typed
    await setLanguage(phone, lang);
  }
  if (conversation) conversation.language = lang;

  if (input.startsWith('menu_')) return handleMenuId(phone, input, conversation, lang);
  if (/^(svc_|date_|time_|confirm_|nav_|lang_)/.test(input)) { await sendMainMenu(phone, lang); return true; } // a stale tap

  const norm = faq.normalize(input);
  if (!norm) return false;

  if (faq.isThanks(norm)) { await say(phone, faq.REPLIES.thanks(lang)); return true; }
  if (faq.isGreeting(norm)) {
    // A hello opens a fresh chat, so offer the language choice every time; "menu"/"help" just show the menu.
    if (/^(menu|start|help|قايمه|القايمه|ابدا|مساعده)$/.test(norm)) { await sendMainMenu(phone, lang); return true; }
    await sendLanguagePrompt(phone);
    return true;
  }

  const langRequest = faq.languageRequest(norm);
  if (langRequest && faq.tokensOf(norm).length <= 5) {
    if (langRequest === 'ask') { await sendLanguagePrompt(phone); return true; }
    await setLanguage(phone, langRequest);
    await sendMainMenu(phone, langRequest, L(langRequest, 'Great — we\'ll continue in English.', 'تمام — سنكمل باللغة العربية.'));
    return true;
  }

  if (chatbot.isHandoffRequest(input)) { await chatbot.requestHuman(phone, input, conversation, lang); return true; }

  const intent = faq.matchIntent(norm);
  const services = faq.findServices(norm);

  if (intent === 'status') { await bookingStatusReply(phone, lang); return true; }
  if (intent === 'prices' || intent === 'services_overview' || (intent === 'warranty' && services.length)) {
    await answer(phone, lang, services.length ? faq.serviceReply(services, lang) : faq.servicesOverview(lang));
    return true;
  }
  if (intent && GENERIC_HANDLED.includes(intent)) { await answer(phone, lang, faq.REPLIES[intent](lang)); return true; }

  // "I want to book ..." starts the booking chat; a bare mention of a service ("fridge repair?") gets its price card.
  if (await bookingFlow.handleMessage(phone, input, conversation)) return true;
  if (services.length && faq.tokensOf(norm).length <= 10) { await answer(phone, lang, faq.serviceReply(services, lang)); return true; }

  return false;
};

// Photos, voice notes, locations, stickers... — we can only read text and taps, so say so instead of staying silent.
const handleUnsupported = async (phone, conversation) => {
  const lang = conversation?.language;
  const en = 'Sorry, I can only read text messages and button taps here. Please type your message or pick an option below.';
  const ar = 'عذراً، أستطيع قراءة الرسائل النصية والأزرار فقط هنا. الرجاء كتابة رسالتك أو اختيار أحد الخيارات أدناه.';
  const body = lang ? L(lang, en, ar) : `${en}\n\n${ar}`;
  await sayButtons(phone, body, [
    { id: 'menu_main', title: L(lang, 'Main menu', 'القائمة الرئيسية') },
    { id: 'menu_human', title: L(lang, 'Talk to our team', 'تحدث مع فريقنا') },
  ]);
};

module.exports = { handle, handleUnsupported, sendMainMenu, sendLanguagePrompt };
