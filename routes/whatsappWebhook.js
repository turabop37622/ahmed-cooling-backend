// Meta WhatsApp Cloud API webhook — the single entry point for every inbound message, which it logs (see
// utils/whatsappConversationStore.js) and then routes to whichever flow should answer, in this order:
//   1. A quick-reply tap on the booking-confirmation template, or a typed yes/no to it -> utils/whatsappBookingBot.js
//   2. Freeform text that answers an open "why are you cancelling?" / "please resend your address" question -> same
//   3. A reply continuing a booking chat already in progress -> utils/whatsappBookingFlow.js
//   4. The front door (language buttons, main menu, instant FAQ answers, "book a service") -> utils/whatsappMenu.js
//   5. Anything that is left -> utils/whatsappChatbot.js (the AI, plus "talk to a human" handoff)
//
// Docs: https://developers.facebook.com/docs/graph-api/webhooks/getting-started
const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const bookingBot = require('../utils/whatsappBookingBot');
const bookingFlow = require('../utils/whatsappBookingFlow');
const media = require('../utils/whatsappMedia');
const chatbot = require('../utils/whatsappChatbot');
const menu = require('../utils/whatsappMenu');
const faq = require('../utils/whatsappFaq');
const store = require('../utils/whatsappConversationStore');
const whatsappCloud = require('../utils/whatsappCloud');
const phoneVerify = require('../utils/phoneVerify');

// Meta signs every webhook body with the app secret (X-Hub-Signature-256: sha256=<hmac>). Without checking it, anyone
// who knows this URL can post fake "customer" messages and drive the booking flow — creating real bookings, admin
// emails and technician assignments for people who don't exist. Set WHATSAPP_APP_SECRET (App settings > Basic >
// App secret) to turn the check on; until it is set the webhook still accepts everything, with a one-time warning.
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;
let warnedNoSecret = false;
const validSignature = (req) => {
  if (!APP_SECRET) {
    if (!warnedNoSecret) {
      warnedNoSecret = true;
      console.warn('⚠️ WHATSAPP_APP_SECRET is not set — WhatsApp webhook requests are NOT being authenticated.');
    }
    return true;
  }
  if (!req.rawBody) return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', APP_SECRET).update(req.rawBody).digest('hex')}`);
  const received = Buffer.from(req.get('X-Hub-Signature-256') || '');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
};

// The GET verification handshake (dotted hub.* query keys) is answered in server.js, before the
// rejectMongoOperators middleware that would otherwise reject it — see the comment there.

const toWaId = (message, waId) => `+${String(waId || message.from || '').replace(/^\+/, '')}`;

// A tap on one of OUR OWN interactive messages (utils/whatsappCloud.js sendButtonsMessage/sendListMessage) —
// distinct from `message.button`, which is a tap on an approved TEMPLATE's fixed quick-reply button.
const interactiveReply = (message) => message.interactive?.button_reply || message.interactive?.list_reply || null;

const str = (value) => (typeof value === 'string' ? value : '');

const inboundText = (message) => {
  if (message.type === 'text') return str(message.text?.body);
  return str(interactiveReply(message)?.title) || str(message.button?.text);
};

// Fixed payload from an approved template's quick-reply button (utils/whatsappBookingBot.js's "please confirm"
// nudge) — never present on our own interactive messages, which carry an `id` instead (see interactiveReply).
const buttonPayload = (message) => str(message.button?.payload) || undefined;
const interactiveId = (message) => str(interactiveReply(message)?.id) || null;

// Meta re-sends a webhook it thinks we didn't acknowledge; without this a retry would be answered twice.
const SEEN_TTL_MS = 10 * 60 * 1000;
const seenMessages = new Map();

// How long the bot waits for a person before answering again (see the status check in the handler below).
const HANDOFF_WAIT_MIN = Number(process.env.WHATSAPP_HANDOFF_WAIT_MIN) || 30; // asked for the team, nobody replied
const HUMAN_IDLE_MIN = Number(process.env.WHATSAPP_HUMAN_IDLE_MIN) || 360; // an admin replied, then went quiet
const alreadySeen = (messageId) => {
  if (!messageId) return false;
  const now = Date.now();
  for (const [id, at] of seenMessages) if (now - at > SEEN_TTL_MS) seenMessages.delete(id);
  if (seenMessages.has(messageId)) return true;
  seenMessages.set(messageId, now);
  return false;
};

const UNSUPPORTED_TYPES = new Set(['image', 'audio', 'voice', 'video', 'document', 'sticker', 'location', 'contacts']);

const handleMessage = async (message, waId, customerName) => {
  if (!waId && !message.from) return;
  if (alreadySeen(message.id)) return;
  const phone = toWaId(message, waId);
  let text = inboundText(message);
  const payload = buttonPayload(message);
  const id = interactiveId(message);
  let isText = message.type === 'text' && !!text;

  let conversation = await store.logMessage(phone, 'in', text || id || payload || `[${message.type}]`, {
    messageType: (payload || id) ? 'button' : 'text',
    customerName,
  });

  // "VERIFY 123456" sent from the app: proves this number belongs to the app account that asked for the code.
  if (isText) {
    const proof = await phoneVerify.handleIncoming(phone, text);
    if (proof.handled) {
      const reply = proof.ok
        ? '✅ Your phone number is verified. You can go back to the Ahmed Cooling app.\n✅ تم توثيق رقم جوالك. يمكنك العودة إلى تطبيق أحمد للتبريد.'
        : '⚠️ This code is not valid for this number, or it has expired. Please request a new code in the app.\n⚠️ هذا الرمز غير صالح لهذا الرقم أو انتهت صلاحيته. اطلب رمزاً جديداً من التطبيق.';
      try { await whatsappCloud.sendTextMessage(phone, reply); } catch { /* the app still shows the result */ }
      await store.logMessage(phone, 'out', reply, { messageType: 'text', sentBy: 'bot' });
      return;
    }
  }

  if (payload && await bookingBot.handleBookingButton(phone, payload)) return;
  if (isText && await bookingBot.handleBookingReasonText(phone, text)) return;
  if (isText && await bookingBot.handleAddressFixText(phone, text)) return;
  if (isText && await bookingBot.handleTypedReply(phone, text)) return;

  // A person has taken over this conversation, so the bot stays quiet — but not forever: if the customer asked for the team
  // and nobody answered within HANDOFF_WAIT_MIN, or the admin went silent for HUMAN_IDLE_MIN, the bot takes over again.
  if (conversation?.status !== 'bot') {
    // A hand-off recorded before statusChangedAt existed has no date at all: it is old, so it counts as expired (the row's
    // updatedAt cannot stand in for it, every incoming message has just bumped that).
    const since = conversation.statusChangedAt ? new Date(conversation.statusChangedAt).getTime() : 0;
    const limitMin = conversation.status === 'needs_human' ? HANDOFF_WAIT_MIN : HUMAN_IDLE_MIN;
    if (Date.now() - since < limitMin * 60 * 1000) return;
    conversation = await store.setStatus(phone, 'bot');
  }

  if (conversation.bookingDraft?.step && bookingFlow.isDraftStale(conversation.bookingDraft)) {
    await bookingFlow.clearDraft(phone);
    conversation.bookingDraft = undefined;
  }
  if (message.type === 'location' && await bookingFlow.handleLocation(phone, message.location, conversation)) return;

  // A photo goes onto the customer's active booking; a voice note becomes text and is handled like a typed message.
  if (message.type === 'image' && await media.handleImage(phone, message, conversation.language === 'ar')) return;
  if (message.type === 'audio' || message.type === 'voice') {
    const heard = await media.transcribe(message);
    if (heard) {
      text = heard;
      isText = true;
      await store.logMessage(phone, 'in', `🎤 ${heard}`, { messageType: 'text' });
    }
  }

  if (!isText && UNSUPPORTED_TYPES.has(message.type)) { await menu.handleUnsupported(phone, conversation); return; }

  const input = id || (isText ? text : null);
  if (!input) return;

  // A menu/language tap always wins (it also abandons a half-finished booking chat); otherwise a booking chat in
  // progress owns the reply, then the front door, then the AI.
  // Picking a language while a booking is half done switches language and carries on with the booking.
  if ((id === 'lang_en' || id === 'lang_ar') && conversation.bookingDraft?.step) {
    await store.setLanguage(phone, id === 'lang_ar' ? 'ar' : 'en');
    await bookingFlow.resume(phone, id === 'lang_ar');
    return;
  }
  const menuTap = !!id && /^(menu_|lang_)/.test(id);
  if (!menuTap && conversation.bookingDraft?.step) {
    if (!id && await handleInterruption(phone, text, conversation)) return;
    if (await bookingFlow.handleMessage(phone, input, conversation)) return;
  }
  if (await menu.handle(phone, input, conversation)) return;
  if (isText) await chatbot.handleIncomingText(phone, text, conversation);
};

// Typed text in the middle of a booking chat that is not an answer to the current step — "change the language",
// "what are your hours?", "talk to a human". Without this the step would swallow it (e.g. as the address).
// Returns true if handled; the booking is then resumed where it was, unless the customer asked to leave it.
const handleInterruption = async (phone, text, conversation) => {
  const norm = faq.normalize(text);
  const tokens = faq.tokensOf(norm);
  const isAr = conversation.language === 'ar';

  const langRequest = faq.languageRequest(norm);
  if (langRequest && tokens.length <= 5) {
    if (langRequest === 'ask') {
      await bookingFlow.clearDraft(phone);
      return menu.handle(phone, text, conversation);
    }
    await store.setLanguage(phone, langRequest);
    await bookingFlow.resume(phone, langRequest === 'ar');
    return true;
  }

  if (chatbot.isHandoffRequest(text) || /^(menu|main menu|القائمة)$/.test(norm)) {
    await bookingFlow.clearDraft(phone);
    return menu.handle(phone, text, conversation);
  }

  // "hello" in the middle of a booking: a new conversation, so start over (the language buttons come first).
  const openStep = conversation.bookingDraft && conversation.bookingDraft.step;
  if (openStep && faq.isGreeting(norm)) {
    await bookingFlow.clearDraft(phone);
    return menu.handle(phone, text, { ...conversation, bookingDraft: undefined });
  }
  // Anything that is not an answer to the question that is open and is more than one word is a conversation: the AI
  // answers, then the booking question is asked again. (One odd word just gets the question repeated.)
  if (openStep && !bookingFlow.looksLikeAnswer(openStep, text) && (tokens.length >= 2 || /[?؟]/.test(text))) {
    await chatbot.handleIncomingText(phone, text, { ...conversation, bookingDraft: undefined });
    await bookingFlow.resume(phone, isAr);
    return true;
  }

  // They only opened the service list and now want to talk about their problem: nothing is committed yet, so leave the
  // booking and let the AI chat (it ends with a "Book a service" button). A service name or a number is still an answer.
  const step = conversation.bookingDraft && conversation.bookingDraft.step;
  const describesProblem = faq.PROBLEM_RE.test(`${text} ${norm}`);
  if (step === 'service' && !/^\d+$/.test(norm) && (describesProblem || tokens.length >= 6 || (tokens.length >= 3 && !faq.findServices(norm).length))) {
    await bookingFlow.clearDraft(phone);
    await chatbot.handleIncomingText(phone, text, { ...conversation, bookingDraft: undefined });
    return true;
  }

  if (faq.isRomanUrdu(text) && tokens.length >= 3 && step && step !== 'address') {
    await chatbot.handleIncomingText(phone, text, { ...conversation, bookingDraft: undefined });
    await bookingFlow.resume(phone, isAr);
    return true;
  }

  const hasQuestionMark = /[?؟]/.test(text);
  if ((hasQuestionMark || tokens.length <= 6) && faq.matchIntent(norm) && await menu.handle(phone, text, conversation)) {
    await bookingFlow.resume(phone, isAr);
    return true;
  }
  // Some other question the canned answers don't cover ("do you fix Samsung ACs?") — let the AI answer, then carry on.
  if (hasQuestionMark && tokens.length > 2) {
    await chatbot.handleIncomingText(phone, text, conversation);
    await bookingFlow.resume(phone, isAr);
    return true;
  }
  return false;
};

// Meta retries the webhook if it doesn't get a fast 2xx, so we ack first and handle the message after responding.
router.post('/webhook', (req, res) => {
  if (!validSignature(req)) return res.sendStatus(401);
  res.sendStatus(200);
  try {
    for (const entry of req.body?.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const waId = value.contacts?.[0]?.wa_id;
        const customerName = value.contacts?.[0]?.profile?.name;
        for (const message of value.messages || []) {
          handleMessage(message, waId, customerName)
            .catch((err) => console.error('❌ WhatsApp webhook message handling failed:', err.message));
        }
        // Delivery reports for what we sent (sent / delivered / read / failed), saved on the inbox line of that message.
        // A "failed" one is the only sign that a message never reached the customer.
        for (const status of value.statuses || []) {
          if (status.status === 'failed') {
            console.error('❌ WhatsApp message not delivered to', status.recipient_id, JSON.stringify(status.errors || []));
            whatsappCloud.recordDeliveryFailure(status);
          }
          store.recordDelivery(status).catch((err) => console.error('❌ WhatsApp delivery status save failed:', err.message));
        }
      }
    }
  } catch (err) {
    console.error('❌ WhatsApp webhook parse error:', err.message);
  }
});

module.exports = router;
