// Technician dispatch ("offer mode"). Instead of the server picking a technician (utils/autoAssign.js), a confirmed
// booking is OPEN to every matching technician, nearest first, until one of them takes it. Rules:
//   - there is no timer on an open booking: it stays visible to all of them until someone accepts (or it is cancelled);
//     the admins are alerted if it waits openAlertMin minutes with no taker
//   - a technician holds one open job at a time (assigned / on the way / in progress) until it is completed or given back
//   - accepting sets the booking's commission aside from the technician's prepaid wallet (utils/wallet.js); a balance
//     that cannot cover it, or a frozen account, cannot accept
//   - a technician can give a job back (reason required); the commission goes to admin review, and maxCancelsPerDay
//     such cancellations in one (Riyadh) day freeze the account for freezeHours
//   - a technician who has not started a job lateGraceMin after its scheduled time is told so, and the booking is open to
//     the others too; whoever accepts takes it over (the late technician's commission is returned)
// Everything is behind AppSetting.offerMode (default off), so the existing auto-assign keeps working until it is on.
const Booking = require('../models/Booking');
const Technician = require('../models/Technician');
const User = require('../models/User');
const AppSetting = require('../models/AppSetting');
const TechnicianCancellation = require('../models/TechnicianCancellation');
const autoAssign = require('./autoAssign');
const wallet = require('./wallet');
const { notifyUser, notifyTechnicianJob } = require('./notify');
const { RIYADH_OFFSET_MS, riyadhDate, normalizeTime } = require('./schedule');

const { OPEN_STATUSES } = autoAssign;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const DEFAULT_SETTINGS = Object.freeze({
  offerMode: false, openAlertMin: 10,
  lateGraceMin: 15, maxCancelsPerDay: 3, freezeHours: 24, deferDays: 7,
});

let settingsCache = { at: 0, value: DEFAULT_SETTINGS };
const getSettings = async ({ fresh = false } = {}) => {
  if (!fresh && Date.now() - settingsCache.at < 15 * 1000) return settingsCache.value;
  try {
    const doc = await AppSetting.findOne({ key: 'app' }).lean();
    const value = { ...DEFAULT_SETTINGS };
    if (doc) for (const k of Object.keys(DEFAULT_SETTINGS)) if (doc[k] !== undefined && doc[k] !== null) value[k] = doc[k];
    settingsCache = { at: Date.now(), value };
  } catch (e) {
    console.error('⚠️ Dispatch settings read failed, using the last known values:', e.message);
  }
  return settingsCache.value;
};
const clearSettingsCache = () => { settingsCache = { at: 0, value: settingsCache.value }; };

// ---------- helpers ----------

// The moment (UTC Date) a booking is due, from its Riyadh date + "10:00 AM" time; null for "Anytime" / no date.
const scheduledAt = (booking) => {
  if (!booking.date || !/^\d{4}-\d{2}-\d{2}$/.test(booking.date)) return null;
  const time = normalizeTime(booking.time || '');
  const m = time && /^(\d{2}):(\d{2}) ([AP])M$/.exec(time);
  if (!m) return null;
  const hour = (Number(m[1]) % 12) + (m[3] === 'P' ? 12 : 0);
  const [y, mo, d] = booking.date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, hour, Number(m[2])) - RIYADH_OFFSET_MS);
};

const startOfRiyadhDay = (at = new Date()) => {
  const [y, mo, d] = riyadhDate(at).split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d) - RIYADH_OFFSET_MS);
};

const distanceKm = (aLat, aLng, bLat, bLng) => {
  const rad = (x) => (x * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

const hasCoords = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);

const notifyAdmins = async (title, message, data = {}) => {
  try {
    const admins = await User.find({ role: 'admin' }).select('_id').lean();
    await Promise.all(admins.map((a) => notifyUser(a._id, { type: 'system', title, message, data, priority: 'high' })));
  } catch (e) {
    console.log('[dispatch] admin notify failed:', e.message);
  }
};

const frozenFilter = (now) => ({ $or: [{ frozenUntil: { $exists: false } }, { frozenUntil: null }, { frozenUntil: { $lte: now } }] });

// ---------- who sees an open booking ----------

// Technician profiles that may see `booking`: opted in to automatic jobs, active, available, not frozen, matching city +
// specialty, and not among the technicians it was hidden from. Returns [{ user, location }] (no balance / busy filter:
// those only decide whether they can accept it).
const matchingTechnicians = async (booking, { excludeIds = [] } = {}) => {
  const now = new Date();
  const excluded = new Set([...excludeIds, ...(booking.hiddenFrom || [])].map(String));
  const city = autoAssign.bookingCity(booking);
  const category = autoAssign.bookingCategory(booking);
  const profiles = await Technician.find({
    autoAssign: true, active: { $ne: false }, availability: { $ne: false }, ...frozenFilter(now),
  }).select('user cities skills currentLocation').lean();
  const matching = profiles.filter((p) => p.user && !excluded.has(String(p.user)) && autoAssign.profileMatches(p, city, category));
  if (!matching.length) return [];
  const users = await User.find({ _id: { $in: matching.map((p) => p.user) }, role: 'technician', isVerified: true })
    .select('fullName phone').lean();
  const locOf = new Map(matching.map((p) => [String(p.user), p.currentLocation && p.currentLocation.coordinates]));
  return users.map((u) => ({ user: u, location: locOf.get(String(u._id)) || [] }));
};

// Tells every matching technician about the open booking (push). Returns how many were told. Never throws.
const notifyOpen = async (booking, { late = false, excludeIds = [] } = {}) => {
  try {
    const techs = await matchingTechnicians(booking, { excludeIds });
    techs.forEach(({ user }) => notifyTechnicianJob(user._id, booking, late ? 'late_offer' : 'offer').catch(() => {}));
    return techs.length;
  } catch (e) {
    console.error('⚠️ Dispatch notify failed:', e.message);
    return 0;
  }
};

// The open bookings one technician can see, nearest first (bookings without a known place come last, oldest first).
// `from` = { lat, lng } of the technician (their phone); otherwise their last saved location.
const openBookingsFor = async (technicianId, from = {}) => {
  const profile = await Technician.findOne({ user: technicianId, autoAssign: true, active: { $ne: false } })
    .select('cities skills currentLocation frozenUntil').lean();
  if (!profile) return [];
  const rows = await Booking.find({
    deletedAt: null, hiddenFrom: { $ne: technicianId },
    $or: [{ status: 'confirmed', technician: null }, { status: 'assigned', lateOfferedAt: { $ne: null }, technician: { $ne: technicianId } }],
  }).sort({ createdAt: 1 }).limit(100).lean();
  const mine = rows.filter((b) => autoAssign.profileMatches(profile, autoAssign.bookingCity(b), autoAssign.bookingCategory(b)));
  const loc = profile.currentLocation && profile.currentLocation.coordinates ? profile.currentLocation.coordinates : [];
  const lat = Number.isFinite(from.lat) ? from.lat : loc[1];
  const lng = Number.isFinite(from.lng) ? from.lng : loc[0];
  return mine
    .map((b) => {
      const bLat = b.coordinates && b.coordinates.latitude;
      const bLng = b.coordinates && b.coordinates.longitude;
      const km = hasCoords(lat, lng) && hasCoords(bLat, bLng) ? Math.round(distanceKm(lat, lng, bLat, bLng) * 10) / 10 : null;
      return { booking: b, km, late: b.status === 'assigned' };
    })
    .sort((a, b) => (a.km === null && b.km === null ? 0 : a.km === null ? 1 : b.km === null ? -1 : a.km - b.km));
};

// When nobody matches the booking at all, or it waited openAlertMin minutes, the admins are told once.
const alertAdmins = async (booking, why) => {
  const flagged = await Booking.findOneAndUpdate(
    { _id: booking._id, openAlertedAt: { $exists: false }, status: 'confirmed', technician: null, deletedAt: null },
    { $set: { openAlertedAt: new Date() } },
    { new: true }
  );
  if (flagged) {
    await notifyAdmins('Booking waiting for a technician', `Booking #${flagged.orderNumber} (${flagged.date || 'no date'} ${flagged.time || ''}) ${why}. Please assign it manually.`, { bookingId: String(flagged._id), kind: 'dispatch_waiting' });
  }
};

// Entry point when a booking becomes ready for a technician (created by a customer on WhatsApp, or confirmed).
// Offer mode off: the old automatic assignment, returned as { mode: 'auto', booking, technician }.
// Offer mode on: pending -> confirmed, then open to every matching technician; returns { mode: 'offer', booking, notified }.
const dispatch = async (booking, { fromStatus = 'pending' } = {}) => {
  const s = await getSettings();
  if (!s.offerMode) {
    const auto = await autoAssign.autoAssignBooking(booking, { fromStatus });
    return auto ? { mode: 'auto', ...auto } : null;
  }
  if (!booking || !booking._id || booking.technician) return null;
  const now = new Date();
  let current;
  if (booking.status === 'pending') {
    current = await Booking.findOneAndUpdate(
      { _id: booking._id, status: 'pending', technician: null, deletedAt: null },
      { $set: { status: 'confirmed', openedAt: now }, $push: { statusHistory: { status: 'confirmed', timestamp: now, note: 'Auto-confirmed (open to technicians)', actorRole: 'system' } } },
      { new: true }
    );
  } else if (booking.status === 'confirmed') {
    current = await Booking.findOneAndUpdate({ _id: booking._id, status: 'confirmed', technician: null, deletedAt: null }, { $set: { openedAt: now } }, { new: true });
  }
  if (!current) return null;
  const notified = await notifyOpen(current);
  if (!notified) await alertAdmins(current, 'has no matching technician');
  return { mode: 'offer', booking: current, notified };
};

// ---------- accepting / declining ----------

const ERR = {
  frozen: 'Your account is frozen for now',
  busy: 'Finish your current job first',
  balance: 'Your wallet balance is too low — please top up',
  gone: 'This booking is no longer available',
  profile: 'Technician account is not active',
  area: 'This booking is outside your area or specialty',
};

// Claims the booking for the technician. Returns { ok: true, booking } or { ok: false, code, message }.
const acceptOffer = async (bookingId, technicianId) => {
  const now = new Date();
  const profile = await Technician.findOne({ user: technicianId }).select('active frozenUntil cities skills').lean();
  if (!profile || profile.active === false) return { ok: false, code: 'profile', message: ERR.profile };
  if (profile.frozenUntil && new Date(profile.frozenUntil) > now) {
    return { ok: false, code: 'frozen', message: ERR.frozen, frozenUntil: profile.frozenUntil };
  }
  const busy = await Booking.findOne({ technician: technicianId, status: { $in: OPEN_STATUSES }, deletedAt: null }).select('_id').lean();
  if (busy) return { ok: false, code: 'busy', message: ERR.busy, activeJobId: String(busy._id) };

  const before = await Booking.findOne({ _id: bookingId, deletedAt: null });
  if (!before) return { ok: false, code: 'gone', message: ERR.gone };
  if (!autoAssign.profileMatches(profile, autoAssign.bookingCity(before), autoAssign.bookingCategory(before))) {
    return { ok: false, code: 'area', message: ERR.area };
  }
  const { amount: need } = await wallet.holdFor(before);
  const balance = await wallet.balanceOf(technicianId);
  if (balance < need) return { ok: false, code: 'balance', message: ERR.balance, balance, required: need };

  const previousTechnician = before.technician ? String(before.technician) : null;
  const takingOver = before.status === 'assigned' && !!before.lateOfferedAt;
  const history = [{
    status: 'assigned', timestamp: now, actorRole: 'technician', actor: technicianId,
    note: takingOver ? 'Taken over from a late technician' : 'Accepted by technician',
  }];
  const updated = await Booking.findOneAndUpdate(
    {
      _id: bookingId, deletedAt: null, hiddenFrom: { $ne: technicianId },
      $or: [{ status: 'confirmed', technician: null }, { status: 'assigned', lateOfferedAt: { $ne: null }, technician: { $ne: technicianId } }],
    },
    {
      $set: { status: 'assigned', technician: technicianId, assignedBy: 'offer', assignedAt: now },
      $unset: { lateOfferedAt: 1, openAlertedAt: 1 },
      ...(previousTechnician ? { $addToSet: { hiddenFrom: previousTechnician } } : {}),
      $push: { statusHistory: { $each: history } },
    },
    { new: true }
  );
  if (!updated) return { ok: false, code: 'gone', message: ERR.gone };

  if (takingOver && previousTechnician) {
    await wallet.releaseHold(before, { note: `Commission returned: #${before.orderNumber} was taken over (late)`, technicianId: before.technician });
    await Technician.updateOne({ user: previousTechnician }, { $inc: { lateCount: 1 } });
    notifyTechnicianJob(previousTechnician, updated, 'reassigned').catch(() => {});
  }
  await wallet.createHold(updated, technicianId);

  const tech = await User.findById(technicianId).select('fullName phone').lean();
  if (updated.user) {
    const num = updated.orderNumber || updated.bookingId;
    notifyUser(updated.user, {
      type: 'booking', priority: 'high',
      title: 'Technician assigned', titleAr: 'تم تعيين فني',
      message: `${tech?.fullName || 'Your technician'} will take your booking #${num} and contact you shortly${tech?.phone ? ' on ' + tech.phone : ''}.`,
      messageAr: `${tech?.fullName || 'الفني'} سيتولى حجزك رقم ${num} وسيتواصل معك قريباً.`,
      data: { bookingId: String(updated._id), publicBookingId: updated.bookingId, orderNumber: updated.orderNumber, status: 'assigned', event: 'assigned' },
    }).catch(() => {});
  }
  return { ok: true, booking: updated, technician: tech, takenOver: takingOver };
};

// "Not for me": the booking disappears from this technician's list only.
const declineOffer = async (bookingId, technicianId) => {
  const r = await Booking.updateOne({ _id: bookingId, deletedAt: null }, { $addToSet: { hiddenFrom: technicianId } });
  return { ok: r.matchedCount > 0 };
};

// ---------- technician gives a booking back ----------

const cancelByTechnician = async (bookingId, technicianId, reasonRaw) => {
  const reason = String(reasonRaw || '').trim().slice(0, 500);
  if (reason.length < 3) return { ok: false, code: 'reason', message: 'Please write the reason for cancelling' };
  const now = new Date();
  const before = await Booking.findOne({ _id: bookingId, technician: technicianId, status: { $in: ['assigned', 'on_the_way'] }, deletedAt: null });
  if (!before) return { ok: false, code: 'gone', message: 'This booking cannot be cancelled by you now' };
  const tech = await User.findById(technicianId).select('fullName').lean();

  const updated = await Booking.findOneAndUpdate(
    { _id: before._id, technician: technicianId, status: { $in: ['assigned', 'on_the_way'] }, deletedAt: null },
    {
      $set: { status: 'confirmed', openedAt: now },
      $unset: { technician: 1, assignedBy: 1, assignedAt: 1, lateOfferedAt: 1, openAlertedAt: 1 },
      $addToSet: { hiddenFrom: technicianId },
      $push: { statusHistory: { status: 'confirmed', timestamp: now, note: `${tech?.fullName || 'Technician'} gave the booking back: ${reason}`, actorRole: 'technician', actor: technicianId } },
    },
    { new: true }
  );
  if (!updated) return { ok: false, code: 'gone', message: 'This booking cannot be cancelled by you now' };

  // The commission stays set aside until an admin decides what happens to it.
  const hold = before.commissionHold && before.commissionHold.status === 'held' ? before.commissionHold : null;
  if (hold) await Booking.updateOne({ _id: before._id, 'commissionHold.status': 'held' }, { $set: { 'commissionHold.status': 'review' } });

  const s = await getSettings();
  const cancellation = await TechnicianCancellation.create({
    technician: technicianId, booking: before._id, orderNumber: before.orderNumber, reason, holdAmount: hold ? hold.amount || 0 : 0,
  });
  const today = await TechnicianCancellation.countDocuments({ technician: technicianId, createdAt: { $gte: startOfRiyadhDay(now) } });
  let frozenUntil = null;
  if (today >= s.maxCancelsPerDay) {
    frozenUntil = new Date(now.getTime() + s.freezeHours * HOUR);
    await Technician.updateOne({ user: technicianId }, { $set: { frozenUntil, frozenReason: `${today} cancellations in one day` } });
    await TechnicianCancellation.updateOne({ _id: cancellation._id }, { $set: { causedFreeze: true } });
    notifyUser(technicianId, {
      type: 'system', priority: 'high',
      title: 'Account frozen', titleAr: 'تم تجميد الحساب',
      message: `You cancelled ${today} bookings today, so your account is frozen until ${frozenUntil.toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
      messageAr: `ألغيت ${today} حجوزات اليوم، لذلك تم تجميد حسابك مؤقتاً.`,
    }).catch(() => {});
  }

  notifyAdmins('Technician cancelled a booking', `${tech?.fullName || 'A technician'} gave back booking #${before.orderNumber}: ${reason}`, { bookingId: String(before._id), kind: 'technician_cancel', cancellationId: String(cancellation._id) });
  if (updated.user) {
    notifyUser(updated.user, {
      type: 'booking', priority: 'high',
      title: 'Finding another technician', titleAr: 'نبحث عن فني آخر',
      message: `Your technician could not make it for booking #${updated.orderNumber}. We are finding you another one.`,
      messageAr: `تعذّر على الفني تنفيذ حجزك رقم ${updated.orderNumber}. نبحث لك عن فني آخر.`,
      data: { bookingId: String(updated._id), orderNumber: updated.orderNumber, status: 'confirmed', event: 'technician_changed' },
    }).catch(() => {});
  }

  // Open to everyone again (the technician who gave it back no longer sees it).
  const notified = await notifyOpen(updated);
  if (!notified) await alertAdmins(updated, 'was given back and has no other matching technician');
  return { ok: true, cancellation, frozenUntil, cancellationsToday: today };
};

// ---------- admin decisions on a technician's cancellation ----------

const reviewCancellation = async (cancellationId, decision, adminId, adminNote = '') => {
  const c = await TechnicianCancellation.findById(cancellationId);
  if (!c) return { ok: false, code: 'missing', message: 'Cancellation not found' };
  if (!['pending', 'deferred'].includes(c.reviewStatus)) return { ok: false, code: 'done', message: 'Already decided' };
  const booking = await Booking.findById(c.booking);
  const note = String(adminNote || '').slice(0, 500);
  const now = new Date();
  if (decision === 'refund') {
    if (booking) await wallet.releaseHold(booking, { type: 'refund', note: `Refunded by admin: #${c.orderNumber}`, createdBy: adminId });
    Object.assign(c, { reviewStatus: 'refunded', decidedBy: adminId, decidedAt: now, adminNote: note });
  } else if (decision === 'forfeit') {
    if (booking) await wallet.forfeitHold(booking);
    Object.assign(c, { reviewStatus: 'forfeited', decidedBy: adminId, decidedAt: now, adminNote: note });
  } else if (decision === 'defer' && c.reviewStatus === 'pending') {
    const s = await getSettings();
    Object.assign(c, { reviewStatus: 'deferred', deferUntil: new Date(now.getTime() + s.deferDays * DAY), decidedBy: adminId, decidedAt: now, adminNote: note });
  } else {
    return { ok: false, code: 'decision', message: 'Decision must be refund, defer or forfeit' };
  }
  await c.save();
  return { ok: true, cancellation: c };
};

// ---------- the background tick ----------

const flagLateJobs = async (now) => {
  const s = await getSettings();
  const today = riyadhDate(now);
  const candidates = await Booking.find({
    status: 'assigned', technician: { $ne: null }, lateOfferedAt: { $exists: false }, deletedAt: null, date: { $lte: today },
  }).limit(100);
  for (const b of candidates) {
    const due = scheduledAt(b);
    if (!due || now.getTime() < due.getTime() + s.lateGraceMin * MINUTE) continue;
    const flagged = await Booking.findOneAndUpdate(
      { _id: b._id, status: 'assigned', lateOfferedAt: { $exists: false } },
      { $set: { lateOfferedAt: now }, $push: { statusHistory: { status: 'assigned', timestamp: now, note: 'Technician is late — offered to other technicians too', actorRole: 'system' } } },
      { new: true }
    );
    if (!flagged) continue;
    notifyTechnicianJob(flagged.technician, flagged, 'late').catch(() => {});
    await notifyOpen(flagged, { late: true, excludeIds: [flagged.technician] });
  }
};

// Open bookings nobody took within openAlertMin minutes: the admins are told once.
const alertStaleOpen = async (now) => {
  const s = await getSettings();
  const stale = await Booking.find({
    status: 'confirmed', technician: null, deletedAt: null, openAlertedAt: { $exists: false },
    openedAt: { $lte: new Date(now.getTime() - s.openAlertMin * MINUTE) },
  }).limit(50);
  for (const b of stale) await alertAdmins(b, `has waited ${s.openAlertMin} minutes without a technician`);
};

const autoRefundDeferred = async (now) => {
  const due = await TechnicianCancellation.find({ reviewStatus: 'deferred', deferUntil: { $lte: now } }).limit(50);
  for (const c of due) {
    const booking = await Booking.findById(c.booking);
    if (booking) await wallet.releaseHold(booking, { type: 'refund', note: `Refunded after the waiting period: #${c.orderNumber}` });
    await TechnicianCancellation.updateOne({ _id: c._id, reviewStatus: 'deferred' }, { $set: { reviewStatus: 'refunded', decidedAt: now, adminNote: 'Automatic refund after the waiting period' } });
  }
};

let running = false;
const tick = async () => {
  if (running) return;
  running = true;
  try {
    const s = await getSettings();
    const now = new Date();
    if (s.offerMode) {
      await flagLateJobs(now);
      await alertStaleOpen(now);
    }
    await autoRefundDeferred(now);
  } catch (e) {
    console.error('❌ Dispatch tick failed:', e.message);
  } finally {
    running = false;
  }
};

let timer = null;
const startScheduler = () => {
  if (timer) return;
  timer = setInterval(() => { tick().catch(() => {}); }, 30 * 1000);
  console.log('✅ Technician dispatch scheduler started (late jobs, waiting-booking alerts, deferred refunds — every 30s).');
};

module.exports = {
  DEFAULT_SETTINGS, getSettings, clearSettingsCache, scheduledAt, startOfRiyadhDay,
  matchingTechnicians, notifyOpen, openBookingsFor, dispatch, acceptOffer, declineOffer, cancelByTechnician, reviewCancellation,
  tick, startScheduler,
};
