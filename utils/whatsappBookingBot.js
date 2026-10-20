// WhatsApp booking-confirmation bot.
//
// Flow: a few minutes after a booking is created (status 'pending'), we send the customer a WhatsApp message
// (an approved template, since this is the first message WE send — Meta requires that outside the customer's
// own 24h messaging window) asking them to confirm, with two quick-reply buttons.
//   - They tap "Yes"  -> booking becomes 'confirmed' (same emails/notifications as every other confirm path).
//   - They tap "No"   -> we ask (freeform text — now inside the 24h window because they just messaged us) why,
//                        then whatever they reply next becomes the cancellation reason and the booking is
//                        cancelled (same as every other cancel path).
//
// Template quick-reply buttons carry a FIXED payload set at template-creation time (Meta does not support a
// per-send dynamic payload), so we cannot stash the bookingId in the button click itself. Instead we match the
// reply to "the customer's most recent pending booking that's awaiting a WhatsApp reply" by phone number —
// correct as long as a customer doesn't have two bookings awaiting confirmation at the same moment.
const Booking = require('../models/Booking');
const { normalizePhone, canonicalSaudiMobile, phoneVariants } = require('./phone');
const whatsappCloud = require('./whatsappCloud');
// Reuses the exact same confirm/cancel emails + in-app notification + audit log as the admin panel and the
// email-link flow (see the exports added at the bottom of routes/bookings.js) instead of duplicating them.
const bookingsRouter = require('../routes/bookings');

const TEMPLATE_NAME = process.env.WHATSAPP_CONFIRM_TEMPLATE_NAME || 'booking_confirmation';
const TEMPLATE_LANG = process.env.WHATSAPP_CONFIRM_TEMPLATE_LANG || 'ar';
// Must match the payload/id configured on the template's two quick-reply buttons in Meta Business Manager.
const CONFIRM_PAYLOAD = process.env.WHATSAPP_CONFIRM_PAYLOAD || 'BOOKING_CONFIRM';
const CANCEL_PAYLOAD = process.env.WHATSAPP_CANCEL_PAYLOAD || 'BOOKING_CANCEL';
const DELAY_MIN = Number(process.env.WHATSAPP_BOOKING_CONFIRM_DELAY_MIN) || 5;
const TICK_MS = 60 * 1000;

const L = (booking, en, ar) => (booking && booking.language === 'ar' ? ar : en);

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
  const { serviceName } = bookingsRouter.emailServiceFields(booking);
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
  }).select('_id phone date time customerName service serviceDetails bookingId language status createdAt').limit(25);

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

const onConfirm = async (phone) => {
  const booking = await findAwaitingBooking(phone);
  if (!booking) return;
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'pending' },
    { $set: { status: 'confirmed' }, $push: { statusHistory: { status: 'confirmed', timestamp: new Date(), note: 'Confirmed by customer via WhatsApp', actorRole: 'customer' } } },
    { new: true }
  );
  if (!updated) return;
  if (updated.email) {
    bookingsRouter.sendBookingConfirmedEmail(updated.email, {
      bookingId: updated.bookingId, orderNumber: updated.orderNumber, customerName: updated.customerName,
      ...bookingsRouter.emailServiceFields(updated), date: updated.date, time: updated.time,
      address: updated.address, totalAmount: updated.totalAmount, currency: updated.currency,
    });
  }
  bookingsRouter.notifyBooking(updated, 'confirmed');
  bookingsRouter.audit({ action: 'booking.status', target: { kind: 'booking', id: String(updated._id), label: updated.orderNumber }, before: { status: 'pending' }, after: { status: 'confirmed', via: 'whatsapp-bot' } });
  await whatsappCloud.sendTextMessage(phone, L(updated,
    `Thank you! Your booking #${updated.orderNumber} is confirmed. See you soon!`,
    `شكراً لك! تم تأكيد حجزك رقم ${updated.orderNumber}. نراكم قريباً!`));
};

const onCancelTapped = async (phone) => {
  const booking = await findAwaitingBooking(phone);
  if (!booking) return;
  await Booking.updateOne({ _id: booking._id }, { $set: { 'whatsappBot.awaitingCancelReason': true } });
  await whatsappCloud.sendTextMessage(phone, L(booking,
    'Sorry to hear that. Could you tell us why, so we can improve? Just reply with a short reason.',
    'يؤسفنا ذلك. ممكن تخبرنا بالسبب حتى نقدر نتحسن؟ فقط أرسل سبب الإلغاء.'));
};

const onTextReply = async (phone, text) => {
  const booking = await findAwaitingBooking(phone, { 'whatsappBot.awaitingCancelReason': true });
  if (!booking) return; // not something we asked for — ignore rather than guess
  const reason = String(text || '').trim().slice(0, 500) || 'No reason given';
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'pending' },
    {
      $set: { status: 'cancelled', cancellationReason: reason, cancelledAt: new Date(), 'whatsappBot.awaitingCancelReason': false },
      $push: { statusHistory: { status: 'cancelled', timestamp: new Date(), note: `Cancelled by customer via WhatsApp: ${reason}`, actorRole: 'customer' } },
    },
    { new: true }
  );
  if (!updated) return;
  if (updated.email) {
    bookingsRouter.sendCustomerCancellationEmail(updated.email, {
      bookingId: updated.bookingId || updated._id.toString(), customerName: updated.customerName,
      ...bookingsRouter.emailServiceFields(updated), date: updated.date, time: updated.time,
      cancellationReason: reason,
    });
  }
  bookingsRouter.notifyBooking(updated, 'cancelled');
  bookingsRouter.audit({ action: 'booking.status', target: { kind: 'booking', id: String(updated._id), label: updated.orderNumber }, before: { status: 'pending' }, after: { status: 'cancelled', reason, via: 'whatsapp-bot' } });
  await whatsappCloud.sendTextMessage(phone, L(updated,
    `Your booking #${updated.orderNumber} has been cancelled. Thank you for letting us know.`,
    `تم إلغاء حجزك رقم ${updated.orderNumber}. شكراً لإخبارنا.`));
};

// `message` is one entry of the webhook payload's value.messages[]; `waId` is value.contacts[0].wa_id (digits only).
const handleIncomingMessage = async (message, waId) => {
  if (!waId) return;
  const phone = `+${String(waId).replace(/^\+/, '')}`;

  const buttonPayload = message.button?.payload || message.interactive?.button_reply?.id;
  if (buttonPayload === CONFIRM_PAYLOAD) return onConfirm(phone);
  if (buttonPayload === CANCEL_PAYLOAD) return onCancelTapped(phone);

  if (message.type === 'text' && message.text?.body) return onTextReply(phone, message.text.body);
};

module.exports = { startScheduler, handleIncomingMessage, tick };
