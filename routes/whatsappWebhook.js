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
const chatbot = require('../utils/whatsappChatbot');
const menu = require('../utils/whatsappMenu');
const faq = require('../utils/whatsappFaq');
const store = require('../utils/whatsappConversationStore');

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
  const text = inboundText(message);
  const payload = buttonPayload(message);
  const id = interactiveId(message);
  const isText = message.type === 'text' && !!text;

  const conversation = await store.logMessage(phone, 'in', text || id || payload || `[${message.type}]`, {
    messageType: (payload || id) ? 'button' : 'text',
    customerName,
  });

  if (payload && await bookingBot.handleBookingButton(phone, payload)) return;
  if (isText && await bookingBot.handleBookingReasonText(phone, text)) return;
  if (isText && await bookingBot.handleAddressFixText(phone, text)) return;
  if (isText && await bookingBot.handleTypedReply(phone, text)) return;

  if (conversation?.status !== 'bot') return; // a person has taken over this conversation — the bot stays quiet

  if (conversation.bookingDraft?.step && bookingFlow.isDraftStale(conversation.bookingDraft)) {
    await bookingFlow.clearDraft(phone);
    conversation.bookingDraft = undefined;
  }
  if (message.type === 'location' && await bookingFlow.handleLocation(phone, message.location, conversation)) return;

  if (UNSUPPORTED_TYPES.has(message.type)) { await menu.handleUnsupported(phone, conversation); return; }

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
      }
    }
  } catch (err) {
    console.error('❌ WhatsApp webhook parse error:', err.message);
  }
});

module.exports = router;
