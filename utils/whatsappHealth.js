// Watches whether Meta still accepts our WhatsApp token, and tells the admin the moment that changes.
//
// Why: when Meta blocks API access (it did, twice, after security checks on the Facebook account behind the app),
// the bot silently stops — Meta neither delivers customer messages to us nor accepts our replies — and nothing in
// our own logs looks wrong, because no request ever arrives. Without this, the only symptom is "customers get no
// answer" and nobody knows why.
//
// Checks every 10 minutes (and once shortly after boot). Emails the admin on a working -> blocked change and again
// when it recovers; the admin panel's WhatsApp Inbox shows the same state as a banner (routes/adminWhatsapp.js).
const axios = require('axios');
const whatsappCloud = require('./whatsappCloud');
const { escapeHtml } = require('./security');

const CHECK_MS = 10 * 60 * 1000;
const FIRST_CHECK_MS = 30 * 1000;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const SENDER_EMAIL = process.env.EMAIL_FROM || ADMIN_EMAIL;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

// ok: true | false | null (null = not checked yet / couldn't tell)
const state = { ok: null, message: null, checkedAt: null, since: null };

const sendEmail = async (subject, html) => {
  if (!BREVO_API_KEY || !ADMIN_EMAIL) return;
  try {
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: 'Ahmed Cooling - WhatsApp Bot', email: SENDER_EMAIL },
      to: [{ email: ADMIN_EMAIL }],
      subject,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">${html}</div>`,
    }, { headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 });
  } catch (err) {
    console.error('❌ WhatsApp health email failed:', err.response?.data || err.message);
  }
};

const announceBlocked = (message) => sendEmail(
  '🚨 WhatsApp bot is DOWN — Meta is blocking API access',
  `<h2 style="color:#DC2626;">The WhatsApp bot cannot reach customers right now</h2>
   <p>Meta rejected our access token: <strong>${escapeHtml(message || 'API access blocked')}</strong></p>
   <p>While this lasts, customers' WhatsApp messages are <strong>not delivered to the bot</strong> and replies cannot be sent. Our server itself is fine.</p>
   <p><strong>What usually fixes it:</strong> open the Facebook account that owns the "Ahmed Cooling Booking Bot" app, approve any
   "new login / was this you?" notification, and complete any pending security or ID check. This page's banner and this email
   will update on their own when access comes back (checked every 10 minutes).</p>`
);

const announceRecovered = () => sendEmail(
  '✅ WhatsApp bot is back — Meta access restored',
  '<h2 style="color:#059669;">WhatsApp bot is working again</h2><p>Meta is accepting our access token again. Customers can message the bot normally.</p>'
);

const check = async () => {
  const result = await whatsappCloud.probe();
  if (result.ok === null) return state; // can't tell (network blip / not configured): keep the last known state
  const previous = state.ok;
  state.checkedAt = new Date();
  if (result.ok !== previous) state.since = state.checkedAt;
  state.ok = result.ok;
  state.message = result.ok ? null : result.message;

  if (result.ok === false && previous !== false) {
    console.error('🚨 WhatsApp: Meta is blocking API access —', result.message);
    await announceBlocked(result.message);
  } else if (result.ok === true && previous === false) {
    console.log('✅ WhatsApp: Meta access restored');
    await announceRecovered();
  }
  return state;
};

let timer = null;
const start = () => {
  if (timer || !whatsappCloud.isConfigured()) return;
  setTimeout(() => check().catch((err) => console.error('❌ WhatsApp health check failed:', err.message)), FIRST_CHECK_MS);
  timer = setInterval(() => check().catch((err) => console.error('❌ WhatsApp health check failed:', err.message)), CHECK_MS);
  console.log('✅ WhatsApp health monitor started (checks Meta access every 10 minutes).');
};

const getState = () => ({ ...state, templates: whatsappCloud.getTemplateLog() });

module.exports = { start, check, getState };
