// Meta WhatsApp Cloud API webhook (receives button taps + text replies for utils/whatsappBookingBot.js).
// Docs: https://developers.facebook.com/docs/graph-api/webhooks/getting-started
const express = require('express');
const router = express.Router();
const bot = require('../utils/whatsappBookingBot');

// The GET verification handshake (dotted hub.* query keys) is answered in server.js, before the
// rejectMongoOperators middleware that would otherwise reject it — see the comment there.

// Meta retries the webhook if it doesn't get a fast 2xx, so we ack first and handle the message after responding.
router.post('/webhook', (req, res) => {
  res.sendStatus(200);
  try {
    for (const entry of req.body?.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const waId = value.contacts?.[0]?.wa_id;
        for (const message of value.messages || []) {
          bot.handleIncomingMessage(message, waId || message.from)
            .catch((err) => console.error('❌ WhatsApp webhook message handling failed:', err.message));
        }
      }
    }
  } catch (err) {
    console.error('❌ WhatsApp webhook parse error:', err.message);
  }
});

module.exports = router;
