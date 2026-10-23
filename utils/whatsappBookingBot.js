// WhatsApp booking-confirmation bot.
//
// Flow: a few minutes after a booking is created (status 'pending'), we send the customer a WhatsApp message
// (an approved template, since this is the first message WE send — Meta requires that outside the customer's
// own 24h messaging window) asking them to confirm, with two quick-reply buttons.
//   - They tap "Yes"  -> the booking moves straight to 'confirmed' and we immediately retry auto-assignment
//                        (utils/autoAssign.js) so it reaches a technician right away, same as a booking made on
//                        WhatsApp or the app/website — no admin step in between.
//   - They tap "No"   -> we ask (freeform text — now inside the 24h window because they just messaged us) why,
//                        then whatever they reply next is recorded as the reason, and the admin cancels it
//                        themselves from the bookings panel (cancellation still goes through a human).
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
const autoAssign = require('./autoAssign');
const { normalizeCity } = autoAssign;
const { notifyTechnicianJob } = require('./notify');

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

const notifyAdminBookingReply = async (booking, { reply, reason, autoAssigned }) => {
  if (!BREVO_API_KEY || !ADMIN_EMAIL) return;
  try {
    const confirmNote = autoAssigned
      ? `✅ YES — confirmed and auto-assigned to a technician`
      : reply === 'confirm' ? '✅ YES — confirmed (no technician auto-assigned yet, needs one from the bookings page)' : null;
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: 'Ahmed Cooling - WhatsApp Bot', email: SENDER_EMAIL },
      to: [{ email: ADMIN_EMAIL }],
      subject: `📋 WhatsApp reply on booking ${booking.orderNumber || booking.bookingId}: customer said ${reply === 'confirm' ? 'YES' : 'NO'}`,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
        <h2 style="color:${reply === 'confirm' ? '#059669' : '#DC2626'};">
          Customer replied ${reply === 'confirm' ? (confirmNote || '✅ YES') : '❌ NO — please cancel'} on WhatsApp
        </h2>
        <p><strong>Booking:</strong> ${escapeHtml(booking.orderNumber || booking.bookingId || '')}</p>
        <p><strong>Customer:</strong> ${escapeHtml(booking.customerName || '')} (${escapeHtml(booking.phone || '')})</p>
        <p><strong>Service:</strong> ${escapeHtml(emailServiceName(booking))}</p>
        <p><strong>Date/time:</strong> ${escapeHtml(booking.date || '')} ${escapeHtml(booking.time || '')}</p>
        ${reason ? `<p><strong>Reason given:</strong> ${escapeHtml(reason)}</p>` : ''}
        ${reply === 'confirm'
          ? (autoAssigned ? '<p>No action needed — a technician is already assigned.</p>' : '<p>Open the admin panel\'s <strong>Bookings</strong> page to assign a technician.</p>')
          : '<p>Open the admin panel\'s <strong>Bookings</strong> page to cancel it.</p>'}
      </div>`,
    }, { headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 });
  } catch (err) {
    console.error('❌ Admin booking-reply email failed:', err.response?.data || err.message);
  }
};

// Alerts the admin about a booking the bot can't move forward on by itself — an address that isn't recognizably
// in Jeddah/Makkah, or a phone number WhatsApp can't deliver to at all. Booking stays 'pending' either way.
const notifyAdminIssue = async (booking, { issue, detail }) => {
  if (!BREVO_API_KEY || !ADMIN_EMAIL) return;
  try {
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: 'Ahmed Cooling - WhatsApp Bot', email: SENDER_EMAIL },
      to: [{ email: ADMIN_EMAIL }],
      subject: `⚠️ Booking ${booking.orderNumber || booking.bookingId}: ${issue}`,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
        <h2 style="color:#D97706;">⚠️ ${escapeHtml(issue)}</h2>
        <p><strong>Booking:</strong> ${escapeHtml(booking.orderNumber || booking.bookingId || '')}</p>
        <p><strong>Customer:</strong> ${escapeHtml(booking.customerName || '')} (${escapeHtml(booking.phone || '')})</p>
        <p><strong>Address on file:</strong> ${escapeHtml(booking.address || '(none)')}</p>
        ${detail ? `<p>${escapeHtml(detail)}</p>` : ''}
        <p>The booking is still <strong>pending</strong>. Open the admin panel's <strong>Bookings</strong> page if it needs a manual follow-up.</p>
      </div>`,
    }, { headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 });
  } catch (err) {
    console.error('❌ Admin issue-alert email failed:', err.response?.data || err.message);
  }
};

// Moves a confirmed booking's job forward: tries auto-assign, acks the customer, tells the admin. Shared by the
// direct "Yes" tap and by handleAddressFixText once a bad address has been corrected.
const finalizeConfirm = async (confirmed, phone) => {
  const auto = await autoAssign.autoAssignBooking(confirmed, { fromStatus: 'confirmed' });
  if (auto) notifyTechnicianJob(auto.technician._id, auto.booking, 'assigned').catch(() => {});
  const finalBooking = auto ? auto.booking : confirmed;

  const ack = auto
    ? L(confirmed, `Thanks! Your booking #${confirmed.orderNumber} is confirmed and a technician has been assigned.`, `شكراً لك! تم تأكيد حجزك رقم ${confirmed.orderNumber} وتعيين فني له.`)
    : L(confirmed, `Thanks! Your booking #${confirmed.orderNumber} is confirmed. A technician will be assigned shortly.`, `شكراً لك! تم تأكيد حجزك رقم ${confirmed.orderNumber}. سيتم تعيين فني له قريباً.`);
  await whatsappCloud.sendTextMessage(phone, ack);
  await logMessage(phone, 'out', ack, { messageType: 'text', sentBy: 'bot' });
  await notifyAdminBookingReply(finalBooking, { reply: 'confirm', autoAssigned: !!auto });
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
  if (!canonicalSaudiMobile(booking.phone)) {
    // Can't reach this number on WhatsApp at all — the booking would otherwise sit silently pending forever.
    await notifyAdminIssue(booking, {
      issue: 'Phone number looks invalid — WhatsApp confirmation could not be sent',
      detail: 'Please contact the customer directly to confirm the details and the phone number.',
    });
    return;
  }
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
      // Tell Meta exactly what each quick-reply button reports back, whatever its label says.
      { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: CONFIRM_PAYLOAD }] },
      { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: CANCEL_PAYLOAD }] },
    ]);
    await logMessage(phone, 'out', `[Template: ${TEMPLATE_NAME}] Please confirm booking ${booking.orderNumber || booking.bookingId}`, {
      messageType: 'template', sentBy: 'bot', customerName: booking.customerName,
    });
  } catch (err) {
    console.error('❌ WhatsApp confirmation request failed for booking', booking.bookingId || booking._id, err.message);
    await notifyAdminIssue(booking, {
      issue: 'WhatsApp confirmation message failed to send',
      detail: 'Meta rejected the message (the number may not be on WhatsApp, or the template needs re-approval) — please contact the customer directly.',
    });
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
    // The address on file might be whatever the app/website form had (sometimes incomplete or missing a city) —
    // check it resolves to Jeddah/Makkah before actually confirming, since that's also what a technician would
    // need to find the customer. If not, hold the booking and ask for a corrected address instead.
    if (!normalizeCity(booking.address)) {
      await Booking.updateOne({ _id: booking._id }, { $set: { 'whatsappBot.awaitingAddressFix': true } });
      const ask = L(booking,
        'Before we confirm, your address doesn\'t look complete — could you reply with your full address, including Jeddah or Makkah?',
        'قبل التأكيد، عنوانك غير واضح بالكامل — ممكن ترسل العنوان الكامل متضمناً جدة أو مكة؟');
      await whatsappCloud.sendTextMessage(phone, ask);
      await logMessage(phone, 'out', ask, { messageType: 'text', sentBy: 'bot' });
      await notifyAdminIssue(booking, {
        issue: 'Customer confirmed, but the address doesn\'t look complete',
        detail: 'We asked them to resend a full address (with Jeddah/Makkah) before the booking is confirmed.',
      });
      return true;
    }

    const confirmed = await Booking.findOneAndUpdate(
      { _id: booking._id, status: 'pending' },
      {
        $set: { status: 'confirmed', 'whatsappBot.customerReply': 'confirm', 'whatsappBot.customerRepliedAt': new Date() },
        $push: { statusHistory: { status: 'confirmed', timestamp: new Date(), note: 'Confirmed by customer via WhatsApp', actorRole: 'customer' } },
      },
      { new: true }
    );
    if (!confirmed) return true; // already changed (e.g. admin already acted on it) — nothing more to do
    await finalizeConfirm(confirmed, phone);
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

const TYPED_YES_RE = /^(yes|y|yeah|yep|confirm|confirmed|ok|okay|haan|han|ji|نعم|ايوه|أيوه|اكيد|أكيد|تمام|موافق)[\s.!؟?]*$/i;
const TYPED_NO_RE = /^(no|n|nope|cancel|nahi|nahin|لا|الغاء|إلغاء)[\s.!؟?]*$/i;

// A customer who TYPES "yes"/"no" to the confirmation nudge instead of tapping its button: if they have a booking
// waiting for exactly that answer, treat it as the tap. Returns true if it did.
const handleTypedReply = async (phone, text) => {
  const t = String(text || '').trim();
  const isYes = TYPED_YES_RE.test(t);
  if (!isYes && !TYPED_NO_RE.test(t)) return false;
  const waiting = await findAwaitingBooking(phone, { 'whatsappBot.customerReply': { $exists: false } });
  if (!waiting) return false;
  return handleBookingButton(phone, isYes ? CONFIRM_PAYLOAD : CANCEL_PAYLOAD);
};

// Called by routes/whatsappWebhook.js for a plain text reply. Returns true if this phone had an open "please
// resend a full address" question outstanding (see handleBookingButton above).
const handleAddressFixText = async (phone, text) => {
  const booking = await findAwaitingBooking(phone, { 'whatsappBot.awaitingAddressFix': true });
  if (!booking) return false;

  const address = String(text || '').trim().slice(0, 300);
  const city = normalizeCity(address);
  if (address.length < 12 || !/\s/.test(address) || !city) {
    const ask = L(booking,
      'That still doesn\'t look complete — please include the area, street, building/landmark, and Jeddah or Makkah.',
      'ما زال العنوان غير واضح — الرجاء ذكر الحي والشارع والمبنى، مع جدة أو مكة.');
    await whatsappCloud.sendTextMessage(phone, ask);
    await logMessage(phone, 'out', ask, { messageType: 'text', sentBy: 'bot' });
    return true;
  }

  const confirmed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'pending' },
    {
      $set: {
        status: 'confirmed', address, city,
        'whatsappBot.awaitingAddressFix': false,
        'whatsappBot.customerReply': 'confirm',
        'whatsappBot.customerRepliedAt': new Date(),
      },
      $push: { statusHistory: { status: 'confirmed', timestamp: new Date(), note: 'Confirmed by customer via WhatsApp (address corrected)', actorRole: 'customer' } },
    },
    { new: true }
  );
  if (!confirmed) return true;
  await finalizeConfirm(confirmed, phone);
  return true;
};

module.exports = { startScheduler, tick, handleBookingButton, handleBookingReasonText, handleAddressFixText, handleTypedReply };
