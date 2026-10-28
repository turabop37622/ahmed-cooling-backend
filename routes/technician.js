// Technician app API (/api/technician). Technician accounts only; every booking query is scoped to the caller.
// Status changes go through PUT /api/bookings/:id/status (one-active-job rule, completion + commission there).
const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Technician = require('../models/Technician');
const User = require('../models/User');
const auth = require('../middleware/auth');
const technicianStats = require('../utils/technicianStats');
const { getCommissionRate } = require('../utils/commission');
const { riyadhDate } = require('../utils/schedule');
const wallet = require('../utils/wallet');
const dispatch = require('../utils/dispatch');
const WalletTransaction = require('../models/WalletTransaction');

const NOT_DELETED = { deletedAt: null };
const OPEN = ['assigned', 'on_the_way', 'in_progress'];
const WORKING_ON = ['on_the_way', 'in_progress'];
const SCOPES = ['active', 'today', 'upcoming', 'completed'];
const LEGACY_SKILLS = ['freezer', 'electronics'];

const serverError = (res) => res.status(500).json({ success: false, message: 'Server error' });

router.use((req, res, next) => auth(req, res, () => {
  if (req.user.role !== 'technician') return res.status(403).json({ success: false, message: 'Technician account required' });
  next();
}));

// Booking filter for a tab. "today" also keeps open jobs from earlier days (overdue) and jobs without a date, so
// nothing assigned disappears from the app; "upcoming" is open jobs on a later date.
const scopeFilter = (technicianId, scope, today = riyadhDate()) => {
  const base = { technician: technicianId, ...NOT_DELETED };
  const noDate = [{ date: null }, { date: '' }];
  switch (scope) {
    case 'active': return { ...base, status: { $in: WORKING_ON } };
    case 'today': return { ...base, status: { $in: OPEN }, $or: [{ date: { $lte: today } }, ...noDate] };
    case 'upcoming': return { ...base, status: { $in: OPEN }, date: { $gt: today } };
    case 'completed': return { ...base, status: 'completed' };
    default: return null;
  }
};
const scopeSort = (scope) => (scope === 'completed'
  ? { 'completion.completedAt': -1, updatedAt: -1, _id: -1 }
  : { date: 1, assignedAt: 1, createdAt: 1, _id: 1 });

const JOB_FIELDS = 'orderNumber bookingId status date time service serviceDetails customerName phone address city coordinates comments problemDescription totalAmount visitCharges currency priority assignedAt assignedBy completion commission commissionHold technician';

// Customer details are only ever returned for the caller's own bookings (every query is scoped to them).
const shapeJob = (b, { history = false } = {}) => {
  const svc = b.service && typeof b.service === 'object' ? b.service : {};
  const job = {
    _id: b._id,
    orderNumber: b.orderNumber,
    bookingId: b.bookingId || null,
    status: b.status,
    date: b.date || null,
    time: b.time || null,
    service: {
      name: svc.name || b.serviceDetails?.name || 'Service',
      nameAr: svc.name_ar || svc.nameAr || null,
      category: svc.category || b.serviceDetails?.category || 'general',
    },
    customerName: b.customerName || '',
    phone: b.phone || '',
    address: b.address || '',
    city: b.city || '',
    coordinates: b.coordinates && (b.coordinates.latitude || b.coordinates.longitude)
      ? { latitude: b.coordinates.latitude, longitude: b.coordinates.longitude } : null,
    comments: b.comments || '',
    problemDescription: b.problemDescription || '',
    totalAmount: b.totalAmount || 0,
    visitCharges: b.visitCharges ?? 0,
    currency: b.currency || 'SAR',
    priority: b.priority || 'normal',
    assignedAt: b.assignedAt || null,
    completion: b.completion && b.completion.completedAt ? b.completion : null,
    commission: b.commission && b.commission.rate !== undefined && b.commission.rate !== null ? b.commission : null,
    // Commission already taken from the wallet when the technician accepted the job (offer mode).
    commissionHeld: b.commissionHold && b.commissionHold.status === 'held'
      ? { amount: b.commissionHold.amount || 0, rate: b.commissionHold.rate } : null,
  };
  if (history) {
    job.statusHistory = (b.statusHistory || []).map((h) => ({ status: h.status, timestamp: h.timestamp, actorRole: h.actorRole || null }));
  }
  return job;
};

router.get('/me', async (req, res) => {
  try {
    const [user, profile, stats, commissionRate] = await Promise.all([
      User.findById(req.user.id).select('fullName phone').lean(),
      Technician.findOne({ user: req.user.id }).select('cities skills availability autoAssign active frozenUntil frozenReason').lean(),
      technicianStats.statsFor([req.user.id]),
      getCommissionRate(),
    ]);
    if (!user) return res.status(404).json({ success: false, message: 'Account not found' });
    const s = stats.get(String(req.user.id)) || technicianStats.EMPTY_STATS;
    res.json({
      success: true,
      technician: {
        name: user.fullName,
        phone: user.phone || null,
        cities: profile?.cities || [],
        specialties: (profile?.skills || []).filter((x) => !LEGACY_SKILLS.includes(x)),
        availability: !!profile && profile.availability !== false,
        autoAssign: !!profile && profile.autoAssign === true,
        active: !!profile && profile.active !== false,
        hasProfile: !!profile,
        frozenUntil: profile && profile.frozenUntil && new Date(profile.frozenUntil) > new Date() ? profile.frozenUntil : null,
        frozenReason: profile && profile.frozenUntil && new Date(profile.frozenUntil) > new Date() ? profile.frozenReason || '' : '',
      },
      stats: {
        completedToday: s.completedToday, completedMonth: s.completedMonth, completedTotal: s.completedTotal,
        earningsToday: s.earningsToday, earningsMonth: s.earningsMonth, commissionDue: s.commissionDue,
        activeJobId: s.activeJobId,
      },
      commissionRate,
    });
  } catch (err) {
    console.error('Technician me error:', err.message);
    serverError(res);
  }
});

router.get('/jobs', async (req, res) => {
  try {
    const scope = req.query.scope === undefined || req.query.scope === '' ? 'today' : req.query.scope;
    if (typeof scope !== 'string' || !SCOPES.includes(scope)) {
      return res.status(400).json({ success: false, message: 'scope must be active, today, upcoming or completed' });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const today = riyadhDate();
    const filter = scopeFilter(req.user.id, scope, today);
    const [rows, total, ...counts] = await Promise.all([
      Booking.find(filter).select(JOB_FIELDS).sort(scopeSort(scope)).skip((page - 1) * limit).limit(limit).lean(),
      Booking.countDocuments(filter),
      ...SCOPES.map((s) => Booking.countDocuments(scopeFilter(req.user.id, s, today))),
    ]);
    res.json({
      success: true,
      jobs: rows.map((b) => shapeJob(b)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      counts: Object.fromEntries(SCOPES.map((s, i) => [s, counts[i]])),
    });
  } catch (err) {
    console.error('Technician jobs error:', err.message);
    serverError(res);
  }
});

router.get('/jobs/:id', async (req, res) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).json({ success: false, message: 'Job not found' });
    const booking = await Booking.findOne({ _id: req.params.id, technician: req.user.id, ...NOT_DELETED })
      .select(`${JOB_FIELDS} statusHistory`).lean();
    if (!booking) return res.status(404).json({ success: false, message: 'Job not found' });
    res.json({ success: true, job: shapeJob(booking, { history: true }) });
  } catch (err) {
    serverError(res);
  }
});

// ---------- job offers (utils/dispatch.js) ----------
// An offered booking shows the service, time, area and money, never the customer's phone or exact address: those
// come with the job once it is accepted.
const shapeOffer = (b, { km, late }, commissionAmount, busy, balance, frozen) => {
  const job = shapeJob(b);
  const canAfford = balance >= commissionAmount;
  return {
    _id: job._id, orderNumber: job.orderNumber, date: job.date, time: job.time, service: job.service,
    area: job.city || String(job.address || '').split(',')[0].trim().slice(0, 40),
    city: job.city, totalAmount: job.totalAmount, currency: job.currency, priority: job.priority,
    distanceKm: km, late: !!late, commissionToHold: commissionAmount,
    // Everyone nearby sees every open booking; these say whether this technician can take it right now.
    canAccept: !frozen && !busy && canAfford,
    blockedReason: frozen ? 'frozen' : busy ? 'busy' : canAfford ? null : 'balance',
  };
};

// Every open booking this technician can see (their city + specialties), nearest first. The app may pass its
// position as ?lat=&lng=; the booking stays here until another technician takes it or the booking is cancelled.
router.get('/offers', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const [open, balance, rate, busyJob, me] = await Promise.all([
      dispatch.openBookingsFor(req.user.id, { lat: Number.isFinite(lat) ? lat : undefined, lng: Number.isFinite(lng) ? lng : undefined }),
      wallet.balanceOf(req.user.id),
      getCommissionRate(),
      Booking.findOne({ technician: req.user.id, status: { $in: OPEN }, ...NOT_DELETED }).select('_id').lean(),
      Technician.findOne({ user: req.user.id }).select('frozenUntil').lean(),
    ]);
    const frozenUntil = me && me.frozenUntil && new Date(me.frozenUntil) > new Date() ? me.frozenUntil : null;
    res.json({
      success: true, balance, busy: !!busyJob, frozenUntil,
      offers: open.map((o) => shapeOffer(o.booking, o, Math.round((o.booking.totalAmount || 0) * rate * 100) / 100, !!busyJob, balance, !!frozenUntil)),
    });
  } catch (err) {
    console.error('Technician offers error:', err.message);
    serverError(res);
  }
});

const dispatchStatus = { frozen: 403, busy: 409, balance: 402, gone: 409, profile: 403, area: 403, reason: 400 };

router.post('/offers/:id/accept', async (req, res) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).json({ success: false, message: 'Offer not found' });
    const result = await dispatch.acceptOffer(req.params.id, req.user.id);
    if (!result.ok) return res.status(dispatchStatus[result.code] || 400).json({ success: false, ...result });
    res.json({ success: true, message: 'Booking accepted', job: shapeJob(result.booking), takenOver: !!result.takenOver });
  } catch (err) {
    console.error('Technician accept error:', err.message);
    serverError(res);
  }
});

router.post('/offers/:id/decline', async (req, res) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).json({ success: false, message: 'Offer not found' });
    await dispatch.declineOffer(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    serverError(res);
  }
});

// Give an accepted booking back. The reason is required; see dispatch.cancelByTechnician for the consequences.
router.post('/jobs/:id/cancel', async (req, res) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).json({ success: false, message: 'Job not found' });
    const result = await dispatch.cancelByTechnician(req.params.id, req.user.id, req.body && req.body.reason);
    if (!result.ok) return res.status(dispatchStatus[result.code] || 400).json({ success: false, ...result });
    res.json({
      success: true, message: 'Booking given back',
      frozenUntil: result.frozenUntil, cancellationsToday: result.cancellationsToday,
    });
  } catch (err) {
    console.error('Technician cancel error:', err.message);
    serverError(res);
  }
});

router.get('/wallet', async (req, res) => {
  try {
    const [balance, transactions] = await Promise.all([
      wallet.balanceOf(req.user.id),
      WalletTransaction.find({ technician: req.user.id }).sort({ createdAt: -1 }).limit(50)
        .select('type amount note booking createdAt').lean(),
    ]);
    res.json({ success: true, balance, transactions });
  } catch (err) {
    serverError(res);
  }
});

// The phone reports its position (when the technician opens the Available tab); open bookings are sorted by it and the
// admin can see it. A [0, 0] or out-of-range point is refused.
router.put('/location', async (req, res) => {
  try {
    const latitude = Number(req.body && req.body.latitude);
    const longitude = Number(req.body && req.body.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (latitude === 0 && longitude === 0)) {
      return res.status(400).json({ success: false, message: 'A valid location is required' });
    }
    const profile = await Technician.findOneAndUpdate(
      { user: req.user.id },
      { $set: { 'currentLocation.type': 'Point', 'currentLocation.coordinates': [longitude, latitude], 'currentLocation.lastUpdated': new Date() } },
      { new: true }
    ).select('_id').lean();
    if (!profile) return res.status(404).json({ success: false, message: 'Technician profile not found' });
    res.json({ success: true });
  } catch (err) {
    serverError(res);
  }
});

router.put('/availability', async (req, res) => {
  try {
    const { availability } = req.body;
    if (typeof availability !== 'boolean') return res.status(400).json({ success: false, message: 'availability must be true or false' });
    const profile = await Technician.findOneAndUpdate(
      { user: req.user.id }, { $set: { availability, updatedAt: new Date() } }, { new: true }
    ).select('availability').lean();
    if (!profile) return res.status(404).json({ success: false, message: 'Technician profile not found. Please contact the office.' });
    res.json({ success: true, message: availability ? 'You are available' : 'You are unavailable', availability: profile.availability });
  } catch (err) {
    serverError(res);
  }
});

module.exports = router;
module.exports.helpers = { scopeFilter, shapeJob, SCOPES };
