// Lets a customer cancel or reschedule one of their own bookings over WhatsApp. It reuses the app's own cancel and
// reschedule code (routes/bookings.js), so the emails, technician push and wallet release are identical.
const Booking = require('../models/Booking');
const { sendTextMessage, sendButtonsMessage, sendListMessage } = require('./whatsappCloud');
const { logMessage } = require('./whatsappConversationStore');
const { phoneVariants } = require('./phone');
const bookingsRouter = require('../routes/bookings');

const L = (isAr, en, ar) => (isAr ? ar : en);
const OPEN = ['pending', 'confirmed', 'assigned'];

const say = async (phone, text) => {
  await sendTextMessage(phone, text);
  await logMessage(phone, 'out', text, { messageType: 'text', sentBy: 'bot' });
};
const sayButtons = async (phone, body, buttons) => {
  try { await sendButtonsMessage(phone, body, buttons); } catch { await sendTextMessage(phone, body); }
  await logMessage(phone, 'out', `${body} [${buttons.map((b) => b.title).join(' / ')}]`, { messageType: 'button', sentBy: 'bot' });
};

const serviceName = (b, isAr) => {
  const s = b.service || {};
  return (isAr ? (s.name_ar || s.nameAr) : null) || s.name || b.serviceDetails?.name || L(isAr, 'Service', 'خدمة');
};
const describe = (b, isAr) => `#${b.orderNumber} — ${serviceName(b, isAr)}\n${[b.date, b.time].filter(Boolean).join(' ')}`;

const openBookings = (phone) => Booking.find({ phone: { $in: phoneVariants(phone) }, status: { $in: OPEN }, deletedAt: null })
  .sort({ createdAt: -1 }).limit(10);

const ownBooking = (phone, id) => {
  if (!/^[a-f\d]{24}$/i.test(String(id))) return null;
  return Booking.findOne({ _id: id, phone: { $in: phoneVariants(phone) }, status: { $in: OPEN }, deletedAt: null });
};

// Runs one of the route handlers without HTTP and returns what it would have answered.
const run = async (handler, booking, body) => {
  const out = { status: 200, body: null };
  const res = { status(code) { out.status = code; return res; }, json(payload) { out.body = payload; return res; } };
  // A phone-only booking (no proven app account) is owned by this WhatsApp number, which Meta has verified.
  const user = booking.user ? { id: String(booking.user), role: 'customer' } : { id: null, role: 'customer', viaPhone: true };
  await handler({ user, body }, res, booking);
  return out;
};

const actions = async (phone, booking, isAr) => {
  await sayButtons(phone, `${describe(booking, isAr)}\n\n${L(isAr, 'What would you like to do?', 'ماذا تريد أن تفعل؟')}`, [
    { id: `menu_mbr_${booking._id}`, title: L(isAr, 'Change date/time', 'تغيير الموعد') },
    { id: `menu_mbc_${booking._id}`, title: L(isAr, 'Cancel booking', 'إلغاء الحجز') },
    { id: 'menu_main', title: L(isAr, 'Main menu', 'القائمة الرئيسية') },
  ]);
  return true;
};

// "cancel / change my booking": the open bookings to choose from (or the one there is).
const start = async (phone, isAr) => {
  const bookings = await openBookings(phone);
  if (!bookings.length) {
    await sayButtons(phone, L(isAr,
      'You have no active booking to change. You can book a new service below.',
      'ليس لديك حجز نشط لتعديله. يمكنك حجز خدمة جديدة بالزر أدناه.'),
    [{ id: 'menu_book', title: L(isAr, 'Book a service', 'حجز خدمة') }, { id: 'menu_main', title: L(isAr, 'Main menu', 'القائمة الرئيسية') }]);
    return true;
  }
  if (bookings.length === 1) return actions(phone, bookings[0], isAr);
  const bodyText = L(isAr, 'Which booking do you want to change?', 'أي حجز تريد تعديله؟');
  const rows = bookings.map((b) => ({
    id: `menu_mb_${b._id}`,
    title: `#${b.orderNumber}`.slice(0, 24),
    description: describe(b, isAr).replace('\n', ' · ').slice(0, 72),
  }));
  await sendListMessage(phone, bodyText, L(isAr, 'My bookings', 'حجوزاتي'), [{ rows }]);
  await logMessage(phone, 'out', `${bodyText} [list: ${rows.map((r) => r.title).join(', ')}]`, { messageType: 'button', sentBy: 'bot' });
  return true;
};

const gone = (phone, isAr) => say(phone, L(isAr,
  'That booking can no longer be changed here (it may already be on its way or finished). Please tap "Talk to our team" from the menu.',
  'لا يمكن تعديل هذا الحجز من هنا (ربما الفني في الطريق أو انتهى). الرجاء اختيار «تحدث مع فريقنا» من القائمة.'));

// menu_mb_<id> pick, menu_mbr_<id> change time, menu_mbc_<id> ask to cancel, menu_mby_<id> cancel confirmed
const handleTap = async (phone, id, isAr) => {
  const m = /^menu_(mb|mbr|mbc|mby)_([a-f\d]{24})$/i.exec(id);
  if (!m) return false;
  const booking = await ownBooking(phone, m[2]);
  if (!booking) { await gone(phone, isAr); return true; }
  if (m[1] === 'mb') return actions(phone, booking, isAr);
  if (m[1] === 'mbc') {
    await sayButtons(phone, `${describe(booking, isAr)}\n\n${L(isAr, 'Cancel this booking?', 'هل تريد إلغاء هذا الحجز؟')}`, [
      { id: `menu_mby_${booking._id}`, title: L(isAr, 'Yes, cancel it', 'نعم، إلغاء') },
      { id: `menu_mb_${booking._id}`, title: L(isAr, 'No, keep it', 'لا، إبقاؤه') },
    ]);
    return true;
  }
  if (m[1] === 'mby') {
    const out = await run(bookingsRouter.cancelForOwner, booking, { reason: 'Cancelled by customer on WhatsApp' });
    if (out.body && out.body.success) {
      await sayButtons(phone, L(isAr, `Your booking #${booking.orderNumber} has been cancelled.`, `تم إلغاء حجزك #${booking.orderNumber}.`),
        [{ id: 'menu_book', title: L(isAr, 'Book a service', 'حجز خدمة') }, { id: 'menu_main', title: L(isAr, 'Main menu', 'القائمة الرئيسية') }]);
    } else await gone(phone, isAr);
    return true;
  }
  // mbr: a new date and time, chosen with the same lists the booking chat uses
  await require('./whatsappBookingFlow').startReschedule(phone, booking, isAr);
  return true;
};

// The new date and time are chosen: apply them. Returns true when the booking was changed.
const finishReschedule = async (phone, draft, isAr) => {
  const booking = await ownBooking(phone, draft.rescheduleId);
  if (!booking) { await gone(phone, isAr); return true; }
  const out = await run(bookingsRouter.rescheduleForOwner, booking, { date: draft.date, time: draft.time });
  if (out.body && out.body.success) {
    await sayButtons(phone, L(isAr,
      `Done — booking #${booking.orderNumber} is now on ${draft.date} at ${draft.time}.`,
      `تم — حجزك #${booking.orderNumber} أصبح في ${draft.date} الساعة ${draft.time}.`),
    [{ id: 'menu_main', title: L(isAr, 'Main menu', 'القائمة الرئيسية') }]);
    return true;
  }
  await say(phone, (out.body && out.body.message) || L(isAr, 'Sorry, that change could not be made.', 'عذراً، تعذر إجراء هذا التغيير.'));
  return false;
};

module.exports = { start, handleTap, finishReschedule };
