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
const faq = require('./whatsappFaq');

let catalogueServices = [];
try { catalogueServices = require('../web/src/lib/services.json'); } catch { catalogueServices = []; }

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
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

const SYSTEM_PROMPT = () => {
  const lines = catalogueServices.slice(0, 40).map((s) => {
    const ar = s.nameAr ? ` / ${s.nameAr}` : '';
    return `- ${s.name}${ar}: from SAR ${s.basePrice}, ~${s.estimatedDuration}${s.isEmergency ? ', emergency service' : ''}${s.warrantyDays ? `, ${s.warrantyDays}-day warranty` : ''}`;
  }).join('\n');
  return `You are the WhatsApp assistant for Ahmed Cooling Workshop (ورشة أحمد للتبريد), an AC and home-appliance repair business serving Jeddah and Makkah, Saudi Arabia only.

Facts you can rely on:
- Areas served: Jeddah and Makkah only (not other cities).
- A technician visit fee of SAR ${VISIT_CHARGE} applies in addition to the service price; the customer pays only after the service is done.
- Emergency support line runs 24/7.
- A customer can book a service right here on WhatsApp — if they want to book, tell them to send "menu" and tap "Book a service" (or say "I want to book a service"); a separate step-by-step flow handles it, not you. They can also book through the Ahmed Cooling app or website.
- When the customer describes a problem with an appliance ("my inverter problem", "AC is not cooling"), have a short, friendly conversation: acknowledge it, ask ONE short question about the symptoms if it is unclear (what exactly happens, since when), mention what our technician would check, and tell them the price starts from the service price above (final after inspection). Never give risky do-it-yourself electrical or gas repair steps. Once you understand the problem, offer to book a technician. A "Book a service" button is shown right under your message, so say "tap Book a service below" instead of asking them to type anything.
- You can see the recent messages of this conversation: use them, do not ask for something the customer already told you.
- You cannot create, change, or look up a specific existing booking yourself — only the step-by-step WhatsApp booking flow, the app, or the website can.
- Services offered (price is a starting price — final price is confirmed after inspection):
${lines}

Rules:
- Reply in the same language the customer wrote in (Arabic, English, or Roman Urdu/Hindi).
- Keep answers short and WhatsApp-appropriate (a few sentences, no markdown headings).
- Never invent a price, address, or policy that isn't listed above.
- If asked to check or change the status of an existing booking, say a team member will help with that specifically — you only handle new bookings (by pointing to the WhatsApp booking flow) and general questions.
- If the customer is upset, asks for a discount/negotiation, reports a problem with a technician, or asks anything you are not confident answering from the facts above, end your reply with the exact text ${HANDOFF_MARKER} on its own — a human will take over.`;
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

const callGroq = async (phone, userText, language) => {
  if (!GROQ_API_KEY) return null;
  const history = await loadHistory(phone, userText);
  const langHint = language === 'ar'
    ? '\nThe customer chose Arabic as their language: answer in Arabic unless they clearly write in another language.'
    : language === 'en'
      ? '\nThe customer chose English in the menu, but answer in the language of their last message: if it is Roman Urdu / Hindi (Urdu written in Latin letters) reply in Roman Urdu, if it is Arabic reply in Arabic, otherwise reply in English.'
      : '';
  // Urdu typed in Latin letters is easy to mistake for English: spot it by its common words and say so explicitly.
  const romanUrduHint = faq.isRomanUrdu(userText)
    ? '\nThe customer\'s last message is written in Roman Urdu: you MUST reply in Roman Urdu (Urdu in Latin letters, e.g. "Aap ka fridge kab se thanda nahi kar raha?"), not in English.'
    : '';
  const request = () => axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT() + langHint + romanUrduHint }, ...history, { role: 'user', content: userText }],
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

const HANDOFF_ACK = (isArabic) => isArabic
  ? 'شكراً لك، سيتواصل معك أحد أفراد فريقنا هنا في أقرب وقت ممكن.'
  : 'Thanks — one of our team will reply to you here shortly.';

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
  const ack = HANDOFF_ACK(isAr);
  await sendTextMessage(phone, ack);
  await logMessage(phone, 'out', ack, { messageType: 'text', sentBy: 'bot' });
  await notifyAdminHandoff(phone, conversation?.customerName, text);
};

// What the customer gets when the AI can't answer (not configured, rate-limited, down): never silence.
const sendTroubleReply = async (phone, isAr) => {
  const body = isAr
    ? 'عذراً، لم أستطع معالجة رسالتك الآن. اختر من الأزرار أدناه أو أعد المحاولة بعد قليل.'
    : 'Sorry, I couldn\'t process that just now. Pick an option below, or try again in a moment.';
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
const handleIncomingText = async (phone, text, conversation) => {
  if (conversation && conversation.status !== 'bot') return; // an admin owns this conversation now — stay quiet
  const language = conversation?.language;
  const isAr = language ? language === 'ar' : looksArabic(text);

  if (isHandoffRequest(text)) {
    await requestHuman(phone, text, conversation, language);
    return;
  }

  const reply = await callGroq(phone, text, language);
  if (!reply) {
    await sendTroubleReply(phone, isAr);
    return;
  }

  const handoff = reply.includes(HANDOFF_MARKER);
  const cleanReply = reply.replace(HANDOFF_MARKER, '').trim() || HANDOFF_ACK(isAr);

  if (handoff || cleanReply.length > 1000) {
    await sendTextMessage(phone, cleanReply);
    await logMessage(phone, 'out', cleanReply, { messageType: 'text', sentBy: 'bot' });
  } else {
    // The answer and the way forward in one message: book, back to the menu, or a person
    const buttons = [
      { id: 'menu_book', title: isAr ? 'احجز خدمة' : 'Book a service' },
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
