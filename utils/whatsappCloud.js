// Thin client for Meta's WhatsApp Cloud API (https://developers.facebook.com/docs/whatsapp/cloud-api).
// Needs WHATSAPP_CLOUD_API_TOKEN + WHATSAPP_PHONE_NUMBER_ID in the environment; without them every send is a no-op
// that logs to the console, same fallback style as utils/sendWhatsApp.js.
const axios = require('axios');

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_CLOUD_API_TOKEN;

const isConfigured = () => !!(PHONE_NUMBER_ID && ACCESS_TOKEN);

const graphUrl = () => `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

const post = async (payload) => {
  if (!isConfigured()) {
    console.log('⚠️ WhatsApp Cloud API not configured, skipping send:', JSON.stringify(payload).slice(0, 300));
    return { fallback: true };
  }
  try {
    const { data } = await axios.post(graphUrl(), payload, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    return data;
  } catch (err) {
    console.error('❌ WhatsApp Cloud API send failed:', err.response?.data || err.message);
    throw err;
  }
};

// `to` is E.164 with or without the leading '+' (Meta accepts digits-only, e.g. "9665XXXXXXXX").
const toWaId = (phone) => String(phone || '').replace(/^\+/, '');

// Sends an approved message template (required for the FIRST message we send about a booking, since the
// customer hasn't messaged us in the last 24h). `components` follows Meta's template-components shape, e.g.
// [{ type: 'body', parameters: [{ type: 'text', text: 'Ahmed' }, ...] }].
const sendTemplateMessage = (to, templateName, languageCode, components = []) => post({
  messaging_product: 'whatsapp',
  to: toWaId(to),
  type: 'template',
  template: { name: templateName, language: { code: languageCode }, components },
});

// Freeform text — only allowed within 24h of the customer's last message to us (true once they've replied
// to the confirmation request, e.g. while we're collecting a cancellation reason).
const sendTextMessage = (to, text) => post({
  messaging_product: 'whatsapp',
  to: toWaId(to),
  type: 'text',
  text: { body: text, preview_url: false },
});

module.exports = { isConfigured, sendTemplateMessage, sendTextMessage, toWaId };
