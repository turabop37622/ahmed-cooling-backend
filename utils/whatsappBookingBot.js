// WhatsApp booking-confirmation bot.
//
// Flow: a few minutes after a booking is created (status 'pending'), we send the customer a WhatsApp message
// (an approved template, since this is the first message WE send — Meta requires that outside the customer's
// own 24h messaging window) asking them to confirm, with two quick-reply buttons.
//   - They tap "Yes"  -> we record it and ask the admin to confirm (the actual status change always happens
//                        through the existing admin bookings panel, never automatically from here).
//   - They tap "No"   -> we ask (freeform text — now inside the 24h window because they just messaged us) why,
//                        then whatever they reply next is recorded as the reason, and again the admin cancels it
//                        themselves from the bookings panel.
//
// Template quick-reply buttons carry a FIXED payload set at template-creation time (Meta does not support a
// per-send dynamic payload), so we cannot stash the bookingId in the button click itself. Instead we match the
// reply to "the customer's most recent pending booking that's awaiting a WhatsApp reply" by phone number —
// correct as long as a customer doesn't have two bookings awaiting confirmation at the same moment.
const axios = require('axios');
const Booking = require('../models/Booking');
const { normalizePhone, canonicalSaudiMobile, phoneVariants } = require('./phone');
const { escapeHtml } = require('./security');
const whatsappCloud = require('./whatsappCloud');
const { logMessage } = require('./whatsappConversationStore');

const TEMPLATE_NAME = process.env.WHATSAPP_CONFIRM_TEMPLATE_NAME || 'booking_confirmation';
const TEMPLATE_LANG = process.env.WHATSAPP_CONFIRM_TEMPLATE_LANG || 'ar';
// Must match the payload/id configured on the template's two quick-reply buttons.
const CONFIRM_PAYLOAD = process.env.WHATSAPP_CONFIRM_PAYLOAD || 'BOOKING_CONFIRM';
const CANCEL_PAYLOAD = process.env.WHATSAPP_CANCEL_PAYLOAD || 'BOOKING_CANCEL';
const DELAY_MIN = Number(process.env.WHATSAPP_BOOKING_CONFIRM_DELAY_MIN) || 5;
const TICK_MS = 60 * 1000;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const SENDER_EMAIL = process.env.EMAIL_FROM || ADMIN_EMAIL;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

const L = (booking, en, ar) => (booking && booking.language === 'ar' ? ar : en);

const emailServiceName = (booking) => {
  const s = booking.service && typeof booking.service === 'object' ? booking.service : {};
  return s.name || s.titleKey || booking.serviceDetails?.name || 'AC Service';
};

const notifyAdminBookingReply = async (booking, { reply, reason }) => {
  if (!BREVO_API_KEY || !ADMIN_EMAIL) return;
  try {
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: 'Ahmed Cooling - WhatsApp Bot', email: SENDER_EMAIL },
      to: [{ email: ADMIN_EMAIL }],
      subject: `📋 WhatsApp reply on booking ${booking.orderNumber || booking.bookingId}: customer said ${reply === 'confirm' ? 'YES' : 'NO'}`,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
        <h2 style="color:${reply === 'confirm' ? '#059669' : '#DC2626'};">
          Customer replied ${reply === 'confirm' ? '✅ YES — please confirm' : '❌ NO — please cancel'} on WhatsApp
        </h2>
        <p><strong>Booking:</strong> ${escapeHtml(booking.orderNumber || booking.bookingId || '')}</p>
        <p><strong>Customer:</strong> ${escapeHtml(booking.customerName || '')} (${escapeHtml(booking.phone || '')})</p>
        <p><strong>Service:</strong> ${escapeHtml(emailServiceName(booking))}</p>
        <p><strong>Date/time:</strong> ${escapeHtml(booking.date || '')} ${escapeHtml(booking.time || '')}</p>
        ${reason ? `<p><strong>Reason given:</strong> ${escapeHtml(reason)}</p>` : ''}
        <p>Open the admin panel's <strong>Bookings</strong> page to ${reply === 'confirm' ? 'confirm' : 'cancel'} it.</p>
      </div>`,
    }, { headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 });
  } catch (err) {
    console.error('❌ Admin booking-reply email failed:', err.response?.data || err.message);
  }
};

// ============================================
// OUTGOING: the "please confirm" nudge, 5 min after a booking is created
// ============================================
// Atomically claims the booking (marks confirmationSentAt) so two overlapping ticks can never send it twice.
const claimForConfirmationSend = (bookingId) => Booking.findOneAndUpdate(
  { _id: bookingId, status: 'pending', 'whatsappBot.confirmationSentAt': { $exists: false } },
  { $set: { 'whatsappBot.confirmationSentAt': new Date() } },
  { new: true }
);

const sendConfirmationRequest = async (booking) => {
  if (!canonicalSaudiMobile(booking.phone)) return; // not a number WhatsApp delivery can reach
  const phone = normalizePhone(booking.phone);
  const serviceName = emailServiceName(booking);
  const when = [booking.date, booking.time].filter(Boolean).join(' ') || '—';
  try {
    await whatsappCloud.sendTemplateMessage(phone, TEMPLATE_NAME, TEMPLATE_LANG, [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: booking.customerName || 'Customer' },
          { type: 'text', text: serviceName },
          { type: 'text', text: when },
        ],
      },
    ]);
    await logMessage(phone, 'out', `[Template: ${TEMPLATE_NAME}] Please confirm booking ${booking.orderNumber || booking.bookingId}`, {
      messageType: 'template', sentBy: 'bot', customerName: booking.customerName,
    });
  } catch (err) {
    console.error('❌ WhatsApp confirmation request failed for booking', booking.bookingId || booking._id, err.message);
  }
};

// Finds pending bookings old enough to nudge and haven't been sent one yet, claims + sends each.
const tick = async () => {
  const cutoff = new Date(Date.now() - DELAY_MIN * 60 * 1000);
  const candidates = await Booking.find({
    status: 'pending',
    deletedAt: null,
    'whatsappBot.confirmationSentAt': { $exists: false },
    createdAt: { $lte: cutoff },
  }).select('_id phone date time customerName service serviceDetails bookingId orderNumber language status createdAt').limit(25);

  for (const booking of candidates) {
    const claimed = await claimForConfirmationSend(booking._id);
    if (!claimed) continue; // already claimed/changed between the find and here
    await sendConfirmationRequest(claimed);
  }
};

let timer = null;
const startScheduler = () => {
  if (timer || !whatsappCloud.isConfigured()) {
    if (!whatsappCloud.isConfigured()) console.log('ℹ️ WhatsApp Cloud API not configured — booking-confirmation bot scheduler not started.');
    return;
  }
  timer = setInterval(() => { tick().catch((err) => console.error('❌ WhatsApp bot tick failed:', err.message)); }, TICK_MS);
  console.log(`✅ WhatsApp booking-confirmation bot started (sends ${DELAY_MIN} min after a booking is created, checks every minute).`);
};

// ============================================
// INCOMING: webhook replies (button taps + the cancellation-reason text)
// ============================================
const findAwaitingBooking = (phone, extra = {}) => Booking.findOne({
  phone: { $in: phoneVariants(phone) },
  status: 'pending',
  deletedAt: null,
  'whatsappBot.confirmationSentAt': { $exists: true },
  ...extra,
}).sort({ 'whatsappBot.confirmationSentAt': -1 });

// Called by routes/whatsappWebhook.js for a quick-reply button tap. Returns true if it matched a booking this
// customer is awaiting a reply on (so the webhook knows not to also pass the message to the general FAQ bot).
const handleBookingButton = async (phone, payload) => {
  if (payload !== CONFIRM_PAYLOAD && payload !== CANCEL_PAYLOAD) return false;
  const booking = await findAwaitingBooking(phone);
  if (!booking) return false;

  if (payload === CONFIRM_PAYLOAD) {
    await Booking.updateOne({ _id: booking._id }, { $set: { 'whatsappBot.customerReply': 'confirm', 'whatsappBot.customerRepliedAt': new Date() } });
    const ack = L(booking,
      `Thanks! We've noted your confirmation for booking #${booking.orderNumber}. Our team will confirm it shortly.`,
      `شكراً لك! سجّلنا تأكيدك لحجزك رقم ${booking.orderNumber}. سيقوم فريقنا بتأكيده قريباً.`);
    await whatsappCloud.sendTextMessage(phone, ack);
    await logMessage(phone, 'out', ack, { messageType: 'text', sentBy: 'bot' });
    await notifyAdminBookingReply(booking, { reply: 'confirm' });
    return true;
  }

  // CANCEL_PAYLOAD: ask why, record the reason once they reply (handleBookingReasonText below).
  await Booking.updateOne({ _id: booking._id }, { $set: { 'whatsappBot.customerReply': 'cancel', 'whatsappBot.awaitingCancelReason': true } });
  const ask = L(booking,
    'Sorry to hear that. Could you tell us why, so we can improve? Just reply with a short reason.',
    'يؤسفنا ذلك. ممكن تخبرنا بالسبب حتى نقدر نتحسن؟ فقط أرسل سبب الإلغاء.');
  await whatsappCloud.sendTextMessage(phone, ask);
  await logMessage(phone, 'out', ask, { messageType: 'text', sentBy: 'bot' });
  return true;
};

// Called by routes/whatsappWebhook.js for a plain text reply. Returns true if this phone had an open
// "why are you cancelling?" question outstanding (so the webhook knows not to also pass it to the FAQ bot).
const handleBookingReasonText = async (phone, text) => {
  const booking = await findAwaitingBooking(phone, { 'whatsappBot.awaitingCancelReason': true });
  if (!booking) return false;

  const reason = String(text || '').trim().slice(0, 500) || 'No reason given';
  await Booking.updateOne({ _id: booking._id }, {
    $set: {
      'whatsappBot.customerReply': 'cancel',
      'whatsappBot.customerReplyReason': reason,
      'whatsappBot.customerRepliedAt': new Date(),
      'whatsappBot.awaitingCancelReason': false,
    },
  });
  const ack = L(booking,
    `Thanks, we've noted it. Our team will process the cancellation for booking #${booking.orderNumber} shortly.`,
    `شكراً لك، تم تسجيل ذلك. سيقوم فريقنا بمعالجة إلغاء حجزك رقم ${booking.orderNumber} قريباً.`);
  await whatsappCloud.sendTextMessage(phone, ack);
  await logMessage(phone, 'out', ack, { messageType: 'text', sentBy: 'bot' });
  await notifyAdminBookingReply(booking, { reply: 'cancel', reason });
  return true;
};

module.exports = { startScheduler, tick, handleBookingButton, handleBookingReasonText };
