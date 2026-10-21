// Meta WhatsApp Cloud API webhook — the single entry point for every inbound message, which it logs (see
// utils/whatsappConversationStore.js) and then routes to whichever flow should answer:
//   1. A quick-reply tap on the booking-confirmation template -> utils/whatsappBookingBot.js
//   2. Freeform text that answers an open "why are you cancelling?" question -> also whatsappBookingBot.js
//   3. Freeform text that answers an open "please resend a full address" question -> also whatsappBookingBot.js
//   4. A "book a service" request, or a reply continuing one already in progress -> utils/whatsappBookingFlow.js
//   5. Anything else -> utils/whatsappChatbot.js (general FAQ answers + "talk to a human" handoff)
//
// Docs: https://developers.facebook.com/docs/graph-api/webhooks/getting-started
const express = require('express');
const router = express.Router();
const bookingBot = require('../utils/whatsappBookingBot');
const bookingFlow = require('../utils/whatsappBookingFlow');
const chatbot = require('../utils/whatsappChatbot');
const store = require('../utils/whatsappConversationStore');

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// The GET verification handshake (dotted hub.* query keys) is answered in server.js, before the
// rejectMongoOperators middleware that would otherwise reject it — see the comment there.

const toWaId = (message, waId) => `+${String(waId || message.from || '').replace(/^\+/, '')}`;

// A tap on one of OUR OWN interactive messages (utils/whatsappCloud.js sendButtonsMessage/sendListMessage) —
// distinct from `message.button`, which is a tap on an approved TEMPLATE's fixed quick-reply button.
const interactiveReply = (message) => message.interactive?.button_reply || message.interactive?.list_reply || null;

const inboundText = (message) => {
  if (message.type === 'text') return message.text?.body || '';
  return interactiveReply(message)?.title || message.button?.text || '';
};

// Fixed payload from an approved template's quick-reply button (utils/whatsappBookingBot.js's "please confirm"
// nudge) — never present on our own interactive messages, which carry an `id` instead (see interactiveReply).
const buttonPayload = (message) => message.button?.payload;
const interactiveId = (message) => interactiveReply(message)?.id || null;

const handleMessage = async (message, waId, customerName) => {
  if (!waId && !message.from) return;
  const phone = toWaId(message, waId);
  const text = inboundText(message);
  const payload = buttonPayload(message);
  const id = interactiveId(message);

  const conversation = await store.logMessage(phone, 'in', text || id || payload || `[${message.type}]`, {
    messageType: (payload || id) ? 'button' : 'text',
    customerName,
  });

  if (payload && await bookingBot.handleBookingButton(phone, payload)) return;
  if (message.type === 'text' && text && await bookingBot.handleBookingReasonText(phone, text)) return;
  if (message.type === 'text' && text && await bookingBot.handleAddressFixText(phone, text)) return;
  if ((id || (message.type === 'text' && text)) && conversation?.status === 'bot' && await bookingFlow.handleMessage(phone, id || text, conversation)) return;
  if (message.type === 'text' && text) await chatbot.handleIncomingText(phone, text, conversation);
};

// Meta retries the webhook if it doesn't get a fast 2xx, so we ack first and handle the message after responding.
router.post('/webhook', (req, res) => {
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
