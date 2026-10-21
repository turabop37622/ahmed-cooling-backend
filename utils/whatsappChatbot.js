// General-purpose WhatsApp FAQ bot: answers free-form customer questions (services, pricing, areas served) using
// Gemini, and hands off to a human (an admin, via the admin panel's WhatsApp Inbox — see routes/adminWhatsapp.js)
// the moment a customer asks for one, or when the model itself decides the question needs a person.
//
// This never touches booking status — that stays with utils/whatsappBookingBot.js and, ultimately, the admin's
// own confirm/cancel action in the existing admin bookings panel.
const axios = require('axios');
const { escapeHtml } = require('./security');
const { sendTextMessage } = require('./whatsappCloud');
const { logMessage, setStatus } = require('./whatsappConversationStore');

let catalogueServices = [];
try { catalogueServices = require('../web/src/lib/services.json'); } catch { catalogueServices = []; }

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const VISIT_CHARGE = (() => {
  const n = Number(process.env.VISIT_CHARGE);
  return Number.isFinite(n) && n >= 0 ? n : 30;
})();
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const SENDER_EMAIL = process.env.EMAIL_FROM || ADMIN_EMAIL;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

// Keyword-based handoff detection: fast, free, and deterministic for the common ways someone asks for a human,
// in English, Arabic and Roman Urdu. Gemini can still ask for a handoff itself (see HANDOFF_MARKER below) for
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
- Bookings are made through the Ahmed Cooling app or website; you cannot create or change a booking yourself.
- Services offered (price is a starting price — final price is confirmed after inspection):
${lines}

Rules:
- Reply in the same language the customer wrote in (Arabic, English, or Roman Urdu/Hindi).
- Keep answers short and WhatsApp-appropriate (a few sentences, no markdown headings).
- Never invent a price, address, or policy that isn't listed above.
- You cannot confirm, cancel, or look up a specific booking's status — if asked, say a team member will help and nothing else.
- If the customer is upset, asks for a discount/negotiation, reports a problem with a technician, or asks anything you are not confident answering from the facts above, end your reply with the exact text ${HANDOFF_MARKER} on its own — a human will take over.`;
};

const callGemini = async (phone, userText) => {
  if (!GEMINI_API_KEY) return null;
  try {
    const { data } = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        system_instruction: { parts: [{ text: SYSTEM_PROMPT() }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        // thinkingBudget: 0 — a WhatsApp FAQ answer doesn't need extended reasoning, and without this the model's
        // internal "thinking" tokens can eat the whole maxOutputTokens budget before any reply text is written.
        generationConfig: { maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 } },
      },
      { params: { key: GEMINI_API_KEY }, headers: { 'Content-Type': 'application/json' }, timeout: 20000 }
    );
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    return text || null;
  } catch (err) {
    console.error('❌ Gemini WhatsApp reply failed:', err.response?.data || err.message);
    return null;
  }
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

// Entry point for the webhook: a free-form text message on a conversation that the booking-confirmation flow
// did not claim (see routes/whatsappWebhook.js). `conversation` is the WhatsAppConversation doc, already
// up to date with this inbound message.
const handleIncomingText = async (phone, text, conversation) => {
  if (conversation && conversation.status !== 'bot') return; // an admin owns this conversation now — stay quiet

  if (HANDOFF_RE.test(text)) {
    await setStatus(phone, 'needs_human');
    const ack = HANDOFF_ACK(looksArabic(text));
    await sendTextMessage(phone, ack);
    await logMessage(phone, 'out', ack, { messageType: 'text', sentBy: 'bot' });
    await notifyAdminHandoff(phone, conversation?.customerName, text);
    return;
  }

  const reply = await callGemini(phone, text);
  if (!reply) return; // not configured, or Gemini failed — admin can still see the message in the inbox and reply

  const handoff = reply.includes(HANDOFF_MARKER);
  const cleanReply = reply.replace(HANDOFF_MARKER, '').trim() || HANDOFF_ACK(looksArabic(text));

  await sendTextMessage(phone, cleanReply);
  await logMessage(phone, 'out', cleanReply, { messageType: 'text', sentBy: 'bot' });

  if (handoff) {
    await setStatus(phone, 'needs_human');
    await notifyAdminHandoff(phone, conversation?.customerName, text);
  }
};

module.exports = { handleIncomingText, notifyAdminHandoff };
