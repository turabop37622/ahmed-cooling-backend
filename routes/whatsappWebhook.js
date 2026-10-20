// Meta WhatsApp Cloud API webhook (receives button taps + text replies for utils/whatsappBookingBot.js).
// Docs: https://developers.facebook.com/docs/graph-api/webhooks/getting-started
const express = require('express');
const router = express.Router();
const bot = require('../utils/whatsappBookingBot');

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// One-time handshake Meta does when you save the webhook URL + verify token in the App dashboard.
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

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
