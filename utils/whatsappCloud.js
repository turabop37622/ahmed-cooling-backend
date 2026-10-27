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
// Meta's "English" is code en and "English (US)" is en_US; a template exists under only one of them and the wrong one
// fails with error 132001. So if that happens, the other English code is tried once.
const OTHER_ENGLISH = { en: 'en_US', en_US: 'en' };
// The last template send that worked and the last one Meta refused, for the admin panel (utils/whatsappHealth.js):
// template messages are what reach customers who have not written to us, so a refusal there is otherwise invisible.
const templateLog = { lastOk: null, lastError: null, lastUndelivered: null };
const recordTemplate = (templateName, err) => {
  if (!err) { templateLog.lastOk = { template: templateName, at: new Date() }; return; }
  const meta = err.response?.data?.error || {};
  templateLog.lastError = {
    template: templateName, at: new Date(), code: meta.code || null,
    message: meta.error_data?.details || meta.message || err.message,
  };
};
const sendTemplateMessage = async (to, templateName, languageCode, components = []) => {
  try {
    const data = await sendTemplateOnce(to, templateName, languageCode, components);
    recordTemplate(templateName);
    return data;
  } catch (err) {
    recordTemplate(templateName, err);
    throw err;
  }
};
const sendTemplateOnce = async (to, templateName, languageCode, components) => {
  const send = (code) => post({
    messaging_product: 'whatsapp',
    to: toWaId(to),
    type: 'template',
    template: { name: templateName, language: { code }, components },
  });
  try {
    return await send(languageCode);
  } catch (err) {
    const other = OTHER_ENGLISH[languageCode];
    if (other && err.response?.data?.error?.code === 132001) return send(other);
    throw err;
  }
};

// Freeform text — only allowed within 24h of the customer's last message to us (true once they've replied
// to the confirmation request, e.g. while we're collecting a cancellation reason).
const sendTextMessage = (to, text) => post({
  messaging_product: 'whatsapp',
  to: toWaId(to),
  type: 'text',
  text: { body: text, preview_url: false },
});

// Up to 3 tappable reply buttons (customer picks one instead of typing) — same 24h-window rule as plain text.
// `buttons`: [{ id, title }], title max 20 characters (Meta truncates/rejects longer ones).
const sendButtonsMessage = (to, bodyText, buttons) => post({
  messaging_product: 'whatsapp',
  to: toWaId(to),
  type: 'interactive',
  interactive: {
    type: 'button',
    body: { text: bodyText },
    action: { buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: String(b.title).slice(0, 20) } })) },
  },
});

// A scrollable native picker (customer taps "View options" then picks a row) — up to 10 rows total across all
// sections. `sections`: [{ title, rows: [{ id, title, description }] }].
const sendListMessage = (to, bodyText, buttonText, sections) => post({
  messaging_product: 'whatsapp',
  to: toWaId(to),
  type: 'interactive',
  interactive: {
    type: 'list',
    body: { text: bodyText },
    action: {
      button: String(buttonText).slice(0, 20),
      sections: sections.map((s) => ({
        title: s.title ? String(s.title).slice(0, 24) : undefined,
        rows: s.rows.slice(0, 10).map((r) => ({
          id: String(r.id),
          title: String(r.title).slice(0, 24),
          description: r.description ? String(r.description).slice(0, 72) : undefined,
        })),
      })),
    },
  },
});

// Cheap read-only call that tells us whether Meta currently accepts our token (no message is sent).
// ok: true = accepted; false = Meta answered with an error (blocked/expired/revoked — `message` says which);
// null = couldn't tell (not configured, or a network problem on our side).
const probe = async () => {
  if (!isConfigured()) return { ok: null, message: 'WhatsApp Cloud API is not configured' };
  try {
    await axios.get(`https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}`, {
      params: { fields: 'id' },
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      timeout: 15000,
    });
    return { ok: true };
  } catch (err) {
    const metaError = err.response?.data?.error;
    if (metaError) return { ok: false, message: metaError.message, code: metaError.code };
    return { ok: null, message: err.message };
  }
};

// Shows a one-tap "Send location" button; the customer's reply arrives as an ordinary location message.
const sendLocationRequest = (to, bodyText) => post({
  messaging_product: 'whatsapp',
  to: toWaId(to),
  type: 'interactive',
  interactive: {
    type: 'location_request_message',
    body: { text: bodyText },
    action: { name: 'send_location' },
  },
});

// Meta accepting a message is not delivery: the webhook later reports "delivered" or "failed" (e.g. the number is not on
// WhatsApp, or the account cannot pay for business-initiated messages). The last failure is kept for the admin panel.
const recordDeliveryFailure = (status) => {
  const e = (status.errors && status.errors[0]) || {};
  templateLog.lastUndelivered = {
    at: new Date(Number(status.timestamp) * 1000 || Date.now()), to: status.recipient_id || null, code: e.code || null,
    message: (e.error_data && e.error_data.details) || e.message || e.title || 'Not delivered',
  };
};
const getTemplateLog = () => ({ ...templateLog });

module.exports = { getTemplateLog, recordDeliveryFailure, isConfigured, probe, sendTemplateMessage, sendTextMessage, sendButtonsMessage, sendListMessage, sendLocationRequest, toWaId };
