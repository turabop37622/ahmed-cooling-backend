// General-purpose WhatsApp FAQ bot: answers free-form customer questions (services, pricing, areas served) using
// a Groq-hosted model, and hands off to a human (an admin, via the admin panel's WhatsApp Inbox — see
// routes/adminWhatsapp.js) the moment a customer asks for one, or when the model itself decides the question
// needs a person.
//
// This never touches booking status — that stays with utils/whatsappBookingBot.js and, ultimately, the admin's
// own confirm/cancel action in the existing admin bookings panel.
const axios = require('axios');
const { escapeHtml } = require('./security');
const { sendTextMessage, sendButtonsMessage } = require('./whatsappCloud');
const { logMessage, setStatus } = require('./whatsappConversationStore');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const Booking = require('../models/Booking');
const { phoneVariants } = require('./phone');
const faq = require('./whatsappFaq');

let catalogueServices = [];
try { catalogueServices = require('../web/src/lib/services.json'); } catch { catalogueServices = []; }

const GROQ_API_KEY = process.env.GROQ_API_KEY;
// The 120b model follows the reply rules far better than the 20b one (tried on real customer messages: the 20b
// answered an Urdu voice note in Hindi script and got the customer's days wrong).
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const VISIT_CHARGE = (() => {
  const n = Number(process.env.VISIT_CHARGE);
  return Number.isFinite(n) && n >= 0 ? n : 30;
})();
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const SENDER_EMAIL = process.env.EMAIL_FROM || ADMIN_EMAIL;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

// Keyword-based handoff detection: fast, free, and deterministic for the common ways someone asks for a human,
// in English, Arabic and Roman Urdu. The model can still ask for a handoff itself (see HANDOFF_MARKER below) for
// cases this list doesn't catch — complaints, price negotiation, anything it isn't confident answering.
const HANDOFF_RE = /\b(human|real\s*person|speak\s*to\s*(someone|a\s*person)|talk\s*to\s*(someone|a\s*person|a\s*human|your\s*(team|staff|worker|technician))|customer\s*(service|care)\s*(agent|rep)|representative|agent)\b|(شخص\s*حقيقي|موظف|ممثل|أتكلم\s*مع|اتكلم\s*مع|تحويلي|محول)|(\binsaan\b|\bbanda\b|\bworker\s*se\b|\bkisi\s*insan\b|\breal\s*person\b|\binsan\s*se\s*baat\b)/i;

const HANDOFF_MARKER = '[[HANDOFF]]';

// Written from what real customers asked on WhatsApp (Oct-Nov 2026): replies were too formal, ignored a booking the
// customer already had, answered a Pakistani voice note in Hindi script, refused to give a number, and told an Arabic
// customer to tap an English button name. Each rule below answers one of those.
const SYSTEM_PROMPT = (bookingContext = '') => {
  const lines = catalogueServices.slice(0, 40).map((s) => {
    const ar = s.nameAr ? ` / ${s.nameAr}` : '';
    return `- ${s.name}${ar}: from SAR ${s.basePrice}${s.isEmergency ? ', emergency service' : ''}`;
  }).join('\n');
  return `You are the WhatsApp assistant of Ahmed Cooling Workshop (ورشة أحمد للتبريد), an AC and home-appliance repair business in Jeddah and Makkah, Saudi Arabia. Talk like a friendly, polite person from the workshop's front desk, not like a robot.

How to talk:
- Warm and natural, short: 1-3 sentences, like a real WhatsApp chat. At most one emoji. No lists unless they ask for prices of several services. No markdown.
- Answer what they actually asked first, then (only if it fits) one next step.
- Use what was already said in this chat; never ask again for something the customer told you.
- Language: reply in the language of the customer's last message — Arabic (Saudi-friendly, simple), English, or Roman Urdu (Urdu in Latin letters, e.g. "Ji bilkul, hamara technician aap ke ghar aa kar check karega."). If the message is in Hindi/Devanagari letters it is a Pakistani customer's voice note: reply in Roman Urdu, NEVER in Devanagari or Urdu script.
- Three buttons are shown under your message automatically: "Book a service", "Main menu", "Talk to our team" (Arabic: «حجز خدمة»، «القائمة الرئيسية»، «تحدث مع فريقنا»). NEVER list or repeat the buttons in your text. When you suggest one, name only that one, exactly as it is shown (see the last line below), in a sentence of the customer's own language. Never tell them to type "menu" or "I want to book a service".
- Plain text only: no HTML, no <br>, no brackets.
- Do not start with "I'm sorry, but I can't…". Say what we CAN do.
- Voice notes reach you as rough speech-to-text: if it is unclear, guess the sensible meaning or ask one short question — do not answer a sentence you do not understand.

Facts you can rely on:
- We are a home service: the technician comes to the customer's home or office anywhere in Jeddah or Makkah. If they ask for our location, say there is no need to bring anything to us because the technician comes to them — book and share their location. Do not say whether we have a shop or office.
- Areas: Jeddah and Makkah only.
- Visit fee SAR ${VISIT_CHARGE} on top of the service price; the customer pays only after the work is done. Final price is confirmed after inspection; spare parts are extra.
- Our WhatsApp number is +966 54 448 3745 (this chat). A technician's own number is not shared in advance: the assigned technician calls the customer before coming. If they want to speak to someone now, offer the "Talk to our team" button. Never just say "I can't provide a number".
- Emergency support runs 24/7.
- Booking: the "Book a service" button below starts a short step-by-step booking (service, date, time, address). They can also book in the Ahmed Cooling app or website. You cannot create or change a booking yourself.
- Problems ("AC not cooling", "microwave trips the power"): acknowledge it kindly, ask ONE short question if needed, say what the technician will check and the starting price of the matching service, then suggest booking. Keep the appliance they are talking about — "it trips the electricity" about a microwave is a microwave problem, not wiring. Never give do-it-yourself electrical or gas repair steps.
- Services (starting prices, final after inspection):
${lines}
${bookingContext}
Rules:
- NEVER say how long a service takes, how soon a technician will arrive, or mention any warranty or guarantee. If asked, say our team confirms that for their case, and offer "Talk to our team".
- Never invent a price, address, discount or policy that is not listed above.
- If they are upset, want a discount, complain about a technician, want to change/reschedule/cancel an existing booking or give a day/time that suits them, or ask something you are not sure about: answer kindly that our team will arrange it with them here, and end your reply with the exact text ${HANDOFF_MARKER} on its own.`;
};

// The customer's own recent bookings (by WhatsApp number), so the AI does not offer a new booking to someone who is
// talking about the one they already have.
const STATUS_WORDS = {
  pending: 'waiting for confirmation', confirmed: 'confirmed', assigned: 'technician assigned', on_the_way: 'technician on the way',
  in_progress: 'work in progress', completed: 'completed', cancelled: 'cancelled',
};
const loadBookingContext = async (phone) => {
  try {
    const bookings = await Booking.find({ phone: { $in: phoneVariants(phone) }, deletedAt: null })
      .sort({ createdAt: -1 }).limit(2).select('orderNumber service serviceDetails date time status').lean();
    if (!bookings.length) return '';
    const rows = bookings.map((b) => {
      const name = (b.service && b.service.name) || (b.serviceDetails && b.serviceDetails.name) || 'Service';
      return `- #${b.orderNumber}: ${name}, ${[b.date, b.time].filter(Boolean).join(' ')}, ${STATUS_WORDS[b.status] || b.status}`;
    });
    return `\nThis customer's recent bookings (you may mention them; changes go to our team):\n${rows.join('\n')}\n`;
  } catch {
    return '';
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One retry on a rate limit / server error — Groq's free tier answers 429 under bursts, and that used to mean the
// customer got no reply at all.
// The last few messages of this chat (the customer's and ours), oldest first, so the model knows what was said before.
// Buttons/lists/templates we sent are noise to it and are left out.
const loadHistory = async (phone, userText) => {
  try {
    const rows = await WhatsAppMessage.find({ phone, messageType: { $in: ['text', 'button'] } }).sort({ createdAt: -1 }).limit(10).lean();
    const turns = [];
    for (const row of rows.reverse()) {
      const body = String(row.body || '').trim();
      if (!body || body.startsWith('[') || body.includes('[list:') || body.includes('[Template')) continue;
      const role = row.direction === 'in' ? 'user' : 'assistant';
      if (turns.length && turns[turns.length - 1].role === role) turns[turns.length - 1].content += `\n${body}`;
      else turns.push({ role, content: body.slice(0, 600) });
    }
    // The message being answered is logged before we get here — it is added once, at the end
    if (turns.length && turns[turns.length - 1].role === 'user' && turns[turns.length - 1].content.endsWith(userText)) turns.pop();
    return turns.slice(-8);
  } catch {
    return [];
  }
};

const callGroq = async (phone, userText, language, isAr) => {
  if (!GROQ_API_KEY) return null;
  const history = await loadHistory(phone, userText);
  const langHint = language === 'ar'
    ? '\nThe customer chose Arabic as their language: answer in Arabic unless they clearly write in another language.'
    : language === 'en'
      ? '\nThe customer chose English in the menu, but answer in the language of their last message: if it is Roman Urdu / Hindi (Urdu written in Latin letters) reply in Roman Urdu, if it is Arabic reply in Arabic, otherwise reply in English.'
      : '';
  // Urdu typed in Latin letters is easy to mistake for English: spot it by its common words and say so explicitly.
  const romanUrduHint = faq.isRomanUrdu(userText) || faq.isDevanagari(userText)
    ? '\nThe customer\'s last message is Urdu (Roman Urdu, or a voice note written in Hindi letters): you MUST reply in Roman Urdu (Urdu in Latin letters, e.g. "Aap ka fridge kab se thanda nahi kar raha?"), not in English, Hindi or Urdu script.'
    : '';
  // The buttons go out in Arabic or English only (a Roman Urdu reply gets the English ones): name them as shown.
  const buttonHint = isAr
    ? '\nThe buttons under this reply are in Arabic: «حجز خدمة»، «القائمة الرئيسية»، «تحدث مع فريقنا».'
    : '\nThe buttons under this reply are in English: "Book a service", "Main menu", "Talk to our team" — use these English names even in a Roman Urdu reply.';
  const bookingContext = await loadBookingContext(phone);
  const request = () => axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT(bookingContext) + langHint + romanUrduHint + buttonHint }, ...history, { role: 'user', content: userText }],
      // gpt-oss spends part of the budget on its own reasoning: keep that short and leave room for the whole answer
      reasoning_effort: 'low',
      max_tokens: 1200,
    },
    { headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const { data } = await request();
      const text = (data.choices?.[0]?.message?.content || '').trim();
      return text || null;
    } catch (err) {
      const status = err.response?.status;
      const retryable = !status || status === 429 || status >= 500;
      console.error(`❌ Groq WhatsApp reply failed (attempt ${attempt}):`, err.response?.data || err.message);
      if (!retryable || attempt === 2) return null;
      await sleep(900);
    }
  }
  return null;
};

// isArabic, or `ur` for a Roman Urdu speaker
const HANDOFF_ACK = (isArabic, ur) => (isArabic
  ? 'شكراً لك، سيتواصل معك أحد أفراد فريقنا هنا في أقرب وقت ممكن 🙏'
  : ur ? 'Shukriya! Hamari team ka koi banda isi chat mein jald aap ko jawab dega 🙏'
    : 'Thank you! One of our team will reply to you right here shortly 🙏');
const speaksUrdu = (text) => faq.isRomanUrdu(text) || faq.isDevanagari(text);

const notifyAdminHandoff = async (phone, customerName, lastMessage) => {
  if (!BREVO_API_KEY || !ADMIN_EMAIL) return;
  try {
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: 'Ahmed Cooling - WhatsApp Bot', email: SENDER_EMAIL },
      to: [{ email: ADMIN_EMAIL }],
      subject: `💬 WhatsApp: customer needs a human reply (${phone})`,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
        <h2 style="color:#DC2626;">A customer asked to speak with a person on WhatsApp</h2>
        <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
        ${customerName ? `<p><strong>Name:</strong> ${escapeHtml(customerName)}</p>` : ''}
        <p><strong>Last message:</strong> ${escapeHtml(lastMessage)}</p>
        <p>Open the admin panel's <strong>WhatsApp Inbox</strong> to reply.</p>
      </div>`,
    }, { headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 });
  } catch (err) {
    console.error('❌ Admin WhatsApp-handoff email failed:', err.response?.data || err.message);
  }
};

// Looks Arabic-script to pick the right acknowledgement language (crude but good enough for a canned line).
const looksArabic = (text) => /[؀-ۿ]/.test(text);

const isHandoffRequest = (text) => HANDOFF_RE.test(text);

// Hands the conversation to a person: the bot goes quiet until an admin replies from the admin panel's WhatsApp
// Inbox (routes/adminWhatsapp.js), and the admin gets an email. `language` is 'en' | 'ar' (the customer's choice).
const requestHuman = async (phone, text, conversation, language) => {
  const isAr = language ? language === 'ar' : looksArabic(text);
  await setStatus(phone, 'needs_human');
  const ack = HANDOFF_ACK(isAr, speaksUrdu(text));
  await sendTextMessage(phone, ack);
  await logMessage(phone, 'out', ack, { messageType: 'text', sentBy: 'bot' });
  await notifyAdminHandoff(phone, conversation?.customerName, text);
};

// What the customer gets when the AI can't answer (not configured, rate-limited, down): never silence.
const sendTroubleReply = async (phone, isAr, ur) => {
  const body = isAr
    ? 'عذراً، لم أستطع معالجة رسالتك الآن. اختر من الأزرار أدناه أو أعد المحاولة بعد قليل.'
    : ur ? 'Maazrat, abhi aap ka message process nahi ho saka. Neeche se koi option chunein ya thori der baad dobara likhein.'
      :'Sorry, I couldn\'t process that just now. Pick an option below, or try again in a moment.';
  const buttons = [
    { id: 'menu_main', title: isAr ? 'القائمة الرئيسية' : 'Main menu' },
    { id: 'menu_human', title: isAr ? 'تحدث مع فريقنا' : 'Talk to our team' },
  ];
  try {
    await sendButtonsMessage(phone, body, buttons);
  } catch {
    await sendTextMessage(phone, body);
  }
  await logMessage(phone, 'out', `${body} [${buttons.map((b) => b.title).join(' / ')}]`, { messageType: 'button', sentBy: 'bot' });
};

// Fallback for anything the menu and the instant FAQ answers (utils/whatsappMenu.js) didn't handle: ask the AI.
// `conversation` is the WhatsAppConversation doc, already up to date with this inbound message.
// One number cannot make the AI run without limit (cost, and a loop of messages): at most AI_PER_HOUR answers an hour.
const AI_PER_HOUR = Number(process.env.WHATSAPP_AI_PER_HOUR) > 0 ? Number(process.env.WHATSAPP_AI_PER_HOUR) : 20;
const aiCalls = new Map(); // phone -> timestamps of the last hour
const aiAllowed = (phone, now = Date.now()) => {
  const recent = (aiCalls.get(phone) || []).filter((t) => now - t < 3600000);
  if (recent.length >= AI_PER_HOUR) { aiCalls.set(phone, recent); return false; }
  recent.push(now);
  aiCalls.set(phone, recent);
  if (aiCalls.size > 5000) for (const [key, times] of aiCalls) if (!times.some((t) => now - t < 3600000)) aiCalls.delete(key);
  return true;
};

const handleIncomingText = async (phone, text, conversation) => {
  if (conversation && conversation.status !== 'bot') return; // an admin owns this conversation now — stay quiet
  const language = conversation?.language;
  // The reply (and its buttons) follow the script the customer actually wrote in; the saved choice only decides a
  // message with no letters of either kind.
  const isAr = looksArabic(text) || (language === 'ar' && !/[a-z]/i.test(text));
  const ur = !isAr && speaksUrdu(text);

  if (isHandoffRequest(text)) {
    await requestHuman(phone, text, conversation, language);
    return;
  }

  if (!aiAllowed(phone)) {
    const body = isAr
      ? 'وصلتنا رسائل كثيرة منك خلال وقت قصير. للمتابعة اختر من القائمة أو تحدث مع فريقنا.'
      : 'We have received many messages from you in a short time. Please use the menu, or talk to our team.';
    await sendButtonsMessage(phone, body, [
      { id: 'menu_main', title: isAr ? 'القائمة الرئيسية' : 'Main menu' },
      { id: 'menu_human', title: isAr ? 'تحدث مع فريقنا' : 'Talk to our team' },
    ]).catch(() => {});
    await logMessage(phone, 'out', body, { messageType: 'text', sentBy: 'bot' });
    return;
  }

  const reply = await callGroq(phone, text, language, isAr);
  if (!reply) {
    await sendTroubleReply(phone, isAr, ur);
    return;
  }

  const handoff = reply.includes(HANDOFF_MARKER);
  const cleanReply = reply.replace(HANDOFF_MARKER, '').trim() || HANDOFF_ACK(isAr, ur);

  if (handoff || cleanReply.length > 1000) {
    await sendTextMessage(phone, cleanReply);
    await logMessage(phone, 'out', cleanReply, { messageType: 'text', sentBy: 'bot' });
  } else {
    // The answer and the way forward in one message: book, back to the menu, or a person
    const buttons = [
      { id: 'menu_book', title: isAr ? 'حجز خدمة' : 'Book a service' },
      { id: 'menu_main', title: isAr ? 'القائمة الرئيسية' : 'Main menu' },
      { id: 'menu_human', title: isAr ? 'تحدث مع فريقنا' : 'Talk to our team' },
    ];
    await sendButtonsMessage(phone, cleanReply, buttons);
    await logMessage(phone, 'out', cleanReply, { messageType: 'text', sentBy: 'bot' });
  }

  if (handoff) {
    await setStatus(phone, 'needs_human');
    await notifyAdminHandoff(phone, conversation?.customerName, text);
  }
};

module.exports = { handleIncomingText, notifyAdminHandoff, isHandoffRequest, requestHuman, sendTroubleReply };
