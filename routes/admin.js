const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const Technician = require('../models/Technician');
const Inquiry = require('../models/Inquiry');
const GeneralRating = require('../models/GeneralRating');
const AuditLog = require('../models/AuditLog');
const auth = require('../middleware/auth');
const { normEmail, burnPasswordCheck } = require('../utils/security');

// ============================================
// SHARED HELPERS
// ============================================
const BOOKING_STATUSES = ['pending', 'confirmed', 'assigned', 'on_the_way', 'in_progress', 'completed', 'cancelled'];
const ACTIVE_STATUSES = ['pending', 'confirmed', 'assigned', 'on_the_way', 'in_progress'];
const NOT_STARTED_STATUSES = ['pending', 'confirmed', 'assigned'];
const WORKING_STATUSES = ['assigned', 'on_the_way', 'in_progress']; // a technician is busy with these
const DELETABLE_STATUSES = ['pending', 'cancelled'];
const ROLES = ['customer', 'technician', 'admin'];
const PAYMENT_STATUSES = ['pending', 'paid', 'partially_paid'];
const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'mobile_payment'];
const BOOKING_SORTS = ['schedule', '-schedule', 'created', '-created'];
const NOT_DELETED = { deletedAt: null }; // matches bookings without the field too
const RIYADH_TZ = 'Asia/Riyadh';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const isObjectId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const serverError = (res) => res.status(500).json({ success: false, message: 'Server error' });
const badRequest = (res, message) => res.status(400).json({ success: false, message });

// Page/limit from the query string: hard cap 100.
const pageParams = (req, defaultLimit = 25) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};
const pageInfo = (total, page, limit) => ({ total, page, limit, pages: Math.ceil(total / limit) });

// A query-string value that must be a single string when present (repeated keys arrive as arrays).
const queryStr = (value) => (value === undefined ? '' : typeof value === 'string' ? value.trim() : null);

// Saudi Arabia has no daylight saving time: Riyadh is always UTC+3.
const riyadhNow = (now = new Date()) => {
  const shifted = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return { date: shifted.toISOString().slice(0, 10), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
};

// Phone-looking searches also match the other ways the same number is written: 05XXXXXXXX, 9665XXXXXXXX,
// +9665XXXXXXXX and 009665XXXXXXXX all reduce to the national part 5XXXXXXXX.
const phoneSearchDigits = (q) => {
  if (!/^[\d\s()+-]+$/.test(q)) return null;
  const digits = q.replace(/\D/g, '');
  if (digits.length < 3) return null;
  const national = digits.replace(/^(?:00966|966|0)/, '');
  return national.length >= 3 ? national : digits;
};

const BOOKING_SEARCH_FIELDS = [
  'customerName', 'phone', 'email', 'orderNumber', 'bookingId', 'address',
  'serviceDetails.name', 'service.name', 'service.name_ar', 'service.nameAr',
];
// Case-insensitive "contains" search; the text is regex-escaped so it can never act as a pattern.
const buildBookingSearch = (raw) => {
  const q = typeof raw === 'string' ? raw.trim().slice(0, 100) : '';
  if (!q) return null;
  const rx = new RegExp(escapeRegex(q), 'i');
  const or = BOOKING_SEARCH_FIELDS.map((field) => ({ [field]: rx }));
  const digits = phoneSearchDigits(q);
  if (digits) or.push({ phone: new RegExp(escapeRegex(digits)) });
  return { $or: or };
};

// "Overdue" and "unassigned" are defined once here and used by both the dashboard stats and the bookings
// list filters, so the dashboard tiles and the filtered list can never disagree.
// Overdue needs the scheduleFields() stage (_dateKey/_timeMin) to have run first.
const overdueMatch = ({ date: today, minutes }) => ({
  $or: [
    { status: { $in: ACTIVE_STATUSES }, _dateKey: { $lt: today } },
    { status: { $in: NOT_STARTED_STATUSES }, _dateKey: today, _timeMin: { $lt: minutes } },
  ],
});
const UNASSIGNED_MATCH = { technician: null }; // matches a missing field too
// Boolean query flags: absent/empty = off, '1'/'true' = on, anything else is invalid (null).
const queryFlag = (value) => {
  const v = queryStr(value);
  if (v === null) return null;
  if (v === '') return false;
  return v === '1' || v === 'true' ? true : null;
};

// Validates the list query string. Returns { error } or everything the bookings pipeline needs.
const parseBookingsQuery = (query = {}) => {
  const status = queryStr(query.status);
  const priority = queryStr(query.priority);
  const from = queryStr(query.from);
  const to = queryStr(query.to);
  const sort = queryStr(query.sort);
  const q = queryStr(query.q);
  if ([status, priority, from, to, sort, q].includes(null)) return { error: 'Invalid query' };
  const unassigned = queryFlag(query.unassigned);
  const overdue = queryFlag(query.overdue);
  if (unassigned === null) return { error: 'unassigned must be 1 or true' };
  if (overdue === null) return { error: 'overdue must be 1 or true' };

  let statusMatch = null;
  if (status === 'active') statusMatch = { $in: ACTIVE_STATUSES };
  else if (BOOKING_STATUSES.includes(status)) statusMatch = status;
  else if (status && status !== 'all') return { error: 'Unknown status' };

  let priorityMatch = null;
  if (priority === 'emergency') priorityMatch = 'emergency';
  else if (priority === 'normal') priorityMatch = { $ne: 'emergency' };
  else if (priority && priority !== 'all') return { error: 'Unknown priority' };

  if ((from && !DAY_RE.test(from)) || (to && !DAY_RE.test(to))) return { error: 'Dates must be YYYY-MM-DD' };
  if (sort && !BOOKING_SORTS.includes(sort)) return { error: 'Unknown sort' };

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25));
  const search = buildBookingSearch(q);
  const listMatch = {};
  if (statusMatch) listMatch.status = statusMatch;
  if (priorityMatch) listMatch.priority = priorityMatch;
  // Like q/from/to, these narrow the base set, so the status counts describe the filtered set too.
  return {
    page, limit, skip: (page - 1) * limit,
    baseMatch: { ...NOT_DELETED, ...(search || {}), ...(unassigned ? UNASSIGNED_MATCH : {}) },
    dateMatch: from || to ? { _dateKey: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : null,
    overdue,
    unassigned,
    listMatch,
    sort: sort || 'schedule',
  };
};

// Adds _dateKey ('YYYY-MM-DD' in Riyadh, or null when the booking has no date) and _timeMin (minutes after
// midnight; 1440 for "Anytime"/no time, so those come after the timed slots of the same day).
const scheduleFields = () => ({
  $addFields: {
    _dateKey: {
      $cond: [
        { $regexMatch: { input: { $cond: [{ $eq: [{ $type: '$date' }, 'string'] }, '$date', ''] }, regex: /^\d{4}-\d{2}-\d{2}$/ } },
        '$date',
        { $cond: [{ $eq: [{ $type: '$scheduledDate' }, 'date'] }, { $dateToString: { date: '$scheduledDate', format: '%Y-%m-%d', timezone: RIYADH_TZ } }, null] },
      ],
    },
    _timeMin: {
      $let: {
        vars: {
          m: {
            $regexFind: {
              input: { $let: { vars: { t: { $ifNull: ['$time', '$scheduledTime'] } }, in: { $cond: [{ $eq: [{ $type: '$$t' }, 'string'] }, '$$t', ''] } } },
              regex: /^\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])?\s*$/,
            },
          },
        },
        in: {
          $cond: [
            { $eq: ['$$m', null] },
            1440,
            {
              $let: {
                vars: {
                  h: { $toInt: { $arrayElemAt: ['$$m.captures', 0] } },
                  min: { $toInt: { $arrayElemAt: ['$$m.captures', 1] } },
                  ap: { $toLower: { $ifNull: [{ $arrayElemAt: ['$$m.captures', 2] }, ''] } },
                },
                in: {
                  $add: [
                    { $multiply: [{ $cond: [{ $eq: ['$$ap', ''] }, '$$h', { $add: [{ $mod: ['$$h', 12] }, { $cond: [{ $eq: ['$$ap', 'pm'] }, 12, 0] }] }] }, 60] },
                    '$$min',
                  ],
                },
              },
            },
          ],
        },
      },
    },
  },
});

// "schedule": upcoming (today onwards) soonest first, then past bookings most recent first, then bookings without a date.
// "-schedule": latest date first, dateless last. "created"/"-created": by creation time.
const sortStages = (sort, today) => {
  if (sort === 'created') return [{ $sort: { createdAt: 1, _id: 1 } }];
  if (sort === '-created') return [{ $sort: { createdAt: -1, _id: -1 } }];
  if (sort === '-schedule') {
    return [
      { $addFields: { _bucket: { $cond: [{ $eq: ['$_dateKey', null] }, 1, 0] } } },
      { $sort: { _bucket: 1, _dateKey: -1, _timeMin: -1, createdAt: -1, _id: -1 } },
    ];
  }
  return [
    {
      $addFields: {
        _bucket: { $cond: [{ $eq: ['$_dateKey', null] }, 2, { $cond: [{ $gte: ['$_dateKey', today] }, 0, 1] }] },
      },
    },
    {
      $addFields: {
        _upDate: { $cond: [{ $eq: ['$_bucket', 0] }, '$_dateKey', null] },
        _upTime: { $cond: [{ $eq: ['$_bucket', 0] }, '$_timeMin', null] },
        _pastDate: { $cond: [{ $eq: ['$_bucket', 1] }, '$_dateKey', null] },
        _pastTime: { $cond: [{ $eq: ['$_bucket', 1] }, '$_timeMin', null] },
      },
    },
    { $sort: { _bucket: 1, _upDate: 1, _upTime: 1, _pastDate: -1, _pastTime: -1, createdAt: -1, _id: -1 } },
  ];
};

// Only what the list needs (the detail endpoint returns the whole booking).
const BOOKING_LIST_PROJECTION = {
  bookingId: 1, orderNumber: 1, customerName: 1, phone: 1, email: 1, user: 1,
  status: 1, priority: 1, date: 1, time: 1, scheduledDate: 1, scheduledTime: 1,
  service: 1, serviceDetails: 1, address: 1, city: 1, technician: 1,
  totalAmount: 1, currency: 1, paymentStatus: 1, paymentMethod: 1,
  rescheduledAt: 1, createdAt: 1, updatedAt: 1,
};

// Filters that need the computed schedule fields: the from/to range and the shared overdue condition.
const scheduleMatchStages = (parsed, now) => {
  const parts = [parsed.dateMatch, parsed.overdue ? overdueMatch(now) : null].filter(Boolean);
  if (!parts.length) return [];
  return [{ $match: parts.length === 1 ? parts[0] : { $and: parts } }];
};

// `now` is riyadhNow(): { date: 'YYYY-MM-DD', minutes } in Riyadh time.
const buildBookingsPipeline = (parsed, now) => [
  { $match: parsed.baseMatch },
  scheduleFields(),
  ...scheduleMatchStages(parsed, now),
  {
    $facet: {
      byStatus: [{ $group: { _id: '$status', n: { $sum: 1 } } }],
      emergency: [{ $match: { priority: 'emergency' } }, { $count: 'n' }],
      total: [{ $match: parsed.listMatch }, { $count: 'n' }],
      rows: [
        { $match: parsed.listMatch },
        ...sortStages(parsed.sort, now.date),
        { $skip: parsed.skip },
        { $limit: parsed.limit },
        { $project: BOOKING_LIST_PROJECTION },
        {
          $lookup: {
            from: User.collection.name,
            localField: 'technician',
            foreignField: '_id',
            pipeline: [{ $project: { fullName: 1, phone: 1 } }],
            as: 'technician',
          },
        },
        { $unwind: { path: '$technician', preserveNullAndEmptyArrays: true } },
      ],
    },
  },
];

const countOf = (facetRows) => facetRows?.[0]?.n || 0;
const statusCounts = (rows = []) => {
  const counts = Object.fromEntries(BOOKING_STATUSES.map((s) => [s, 0]));
  for (const r of rows) if (r._id in counts) counts[r._id] = r.n;
  counts.all = BOOKING_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  counts.active = ACTIVE_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  return counts;
};

// Revenue counts SAR (or legacy bookings with no currency) only, so amounts in other currencies are never mixed in.
const SAR_ONLY = { currency: { $in: ['SAR', null] } };
// Unassigned on the dashboard = confirmed bookings waiting for a technician (pending ones can't be assigned yet).
const buildStatsPipeline = (now) => [
  { $match: NOT_DELETED },
  scheduleFields(),
  {
    $facet: {
      byStatus: [{ $group: { _id: '$status', n: { $sum: 1 } } }],
      todayJobs: [{ $match: { _dateKey: now.date, status: { $ne: 'cancelled' } } }, { $count: 'n' }],
      overdue: [{ $match: overdueMatch(now) }, { $count: 'n' }],
      emergencies: [{ $match: { priority: 'emergency', status: { $in: ACTIVE_STATUSES } } }, { $count: 'n' }],
      unassigned: [{ $match: { status: 'confirmed', ...UNASSIGNED_MATCH } }, { $count: 'n' }],
      revenue: [
        { $match: { status: 'completed', ...SAR_ONLY } },
        {
          $group: {
            _id: null,
            completed: { $sum: { $ifNull: ['$totalAmount', 0] } },
            paid: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, { $ifNull: ['$totalAmount', 0] }, 0] } },
          },
        },
      ],
      reviews: [
        { $match: { 'customerFeedback.rating': { $gte: 1 } } },
        {
          $group: {
            _id: null,
            average: { $avg: '$customerFeedback.rating' },
            count: { $sum: 1 },
            pending: { $sum: { $cond: [{ $eq: ['$customerFeedback.approved', true] }, 0, 1] } },
          },
        },
      ],
    },
  },
];

const roundAvg = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);

const shapeStats = ({ bookings = {}, roles = [], services = [], newInquiries = 0 }) => {
  const byStatus = statusCounts(bookings.byStatus);
  delete byStatus.active;
  const roleCount = (role) => roles.find((r) => r._id === role)?.n || 0;
  const svc = (active) => services.find((r) => r._id === active)?.n || 0;
  const rev = bookings.revenue?.[0] || {};
  const rv = bookings.reviews?.[0] || {};
  return {
    byStatus,
    today: {
      jobs: countOf(bookings.todayJobs),
      overdue: countOf(bookings.overdue),
      emergencies: countOf(bookings.emergencies),
      unassigned: countOf(bookings.unassigned),
    },
    revenue: { completedSAR: rev.completed || 0, paidSAR: rev.paid || 0 },
    users: { customers: roleCount('customer'), technicians: roleCount('technician'), admins: roleCount('admin') },
    services: { active: svc(true), inactive: svc(false) },
    reviews: { average: rv.count ? roundAvg(rv.average) : null, count: rv.count || 0, pending: rv.pending || 0 },
    inquiries: { new: newInquiries },
  };
};

// Booking lookups accept the Mongo id or the human booking/order number.
const bookingKeyFilter = (key) => {
  if (typeof key !== 'string' || !key || key.length > 64) return null;
  return isObjectId(key) ? { _id: key } : { $or: [{ bookingId: key }, { orderNumber: key }] };
};
const bookingLabel = (b) => b?.bookingId || b?.orderNumber || String(b?._id || '');

// Soft delete rules: only pending or cancelled bookings; deleting an already-deleted booking is a no-op success.
// Returns { status, body } so the decision can be tested without a database.
const deleteDecision = (booking) => {
  if (!booking) return { status: 404, body: { success: false, message: 'Booking not found' } };
  if (booking.deletedAt) return { status: 200, body: { success: true, message: 'Booking already deleted', alreadyDeleted: true } };
  if (!DELETABLE_STATUSES.includes(booking.status)) return { status: 409, body: { success: false, message: 'Cancel the booking first' } };
  return null; // allowed
};

const JWT_SECRET = process.env.JWT_SECRET;

// ============================================
// LOGIN (public, before adminAuth) — the only way an admin signs in
// ============================================
router.post('/login', async (req, res) => {
  try {
    const cleanEmail = normEmail(req.body.email);
    const cleanPass = typeof req.body.password === 'string' ? req.body.password : '';
    if (!cleanEmail || !cleanPass || cleanPass.length > 200) return badRequest(res, 'Email and password are required');

    const dbAdmin = await User.findOne({ email: cleanEmail, role: 'admin' });
    if (!dbAdmin) await burnPasswordCheck(cleanPass);
    if (dbAdmin && dbAdmin.isVerified !== false && await dbAdmin.comparePassword(cleanPass)) {
      const token = jwt.sign(
        { id: dbAdmin._id, email: dbAdmin.email, role: 'admin' },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '8h' }
      );
      return res.json({
        success: true,
        token,
        user: { id: dbAdmin._id, fullName: dbAdmin.fullName || 'Admin', email: dbAdmin.email, role: 'admin', isVerified: true },
      });
    }
    return res.status(401).json({ success: false, message: 'Invalid admin email or password' });
  } catch (err) {
    return serverError(res);
  }
});

// Same token checks as every other route (signature, verified account, password-change revocation),
// then the role must be admin in the database — not just in the token.
const adminAuth = (req, res, next) => auth(req, res, () => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
  next();
});

router.use(adminAuth);

// A wrong current password is a 400 (a form error), not a 401: the admin's session is still valid.
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || !currentPassword) return badRequest(res, 'Current password is required');
    if (typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 72) {
      return badRequest(res, 'Use a new password of 12 to 72 characters');
    }
    if (newPassword === currentPassword) return badRequest(res, 'The new password must be different from the current one');
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ success: false, message: 'Account unavailable' });
    if (!(await user.comparePassword(currentPassword))) return badRequest(res, 'Current password is incorrect');
    user.password = newPassword; // the pre-save hook sets passwordChangedAt, which revokes older tokens
    await user.save();
    res.json({ success: true, message: 'Password changed. Please sign in again.' });
  } catch {
    res.status(500).json({ success: false, message: 'Could not change password' });
  }
});

// ============================================
// DASHBOARD STATS
// ============================================
router.get('/stats', async (req, res) => {
  try {
    const now = riyadhNow();
    const [bookingFacets, roles, services, newInquiries] = await Promise.all([
      Booking.aggregate(buildStatsPipeline(now)),
      User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]),
      Service.aggregate([{ $group: { _id: { $ne: ['$active', false] }, n: { $sum: 1 } } }]),
      Inquiry.countDocuments({ status: 'new' }),
    ]);
    res.json({ success: true, ...shapeStats({ bookings: bookingFacets[0], roles, services, newInquiries }) });
  } catch (err) {
    console.error('Admin stats error:', err.message);
    serverError(res);
  }
});

// ============================================
// BOOKINGS
// ============================================
router.get('/bookings', async (req, res) => {
  try {
    const parsed = parseBookingsQuery(req.query);
    if (parsed.error) return badRequest(res, parsed.error);
    const [result = {}] = await Booking.aggregate(buildBookingsPipeline(parsed, riyadhNow()));
    const total = countOf(result.total);
    const counts = { ...statusCounts(result.byStatus), emergency: countOf(result.emergency) };
    res.json({ success: true, bookings: result.rows || [], ...pageInfo(total, parsed.page, parsed.limit), counts });
  } catch (err) {
    console.error('Admin bookings list error:', err.message);
    serverError(res);
  }
});

router.get('/bookings/:id', async (req, res) => {
  try {
    const filter = bookingKeyFilter(req.params.id);
    if (!filter) return res.status(404).json({ success: false, message: 'Booking not found' });
    const booking = await Booking.findOne({ ...filter, ...NOT_DELETED })
      .populate('technician', 'fullName phone')
      .populate('user', 'fullName email phone')
      .lean();
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    delete booking.__v;
    delete booking.idempotencyKey;
    res.json({ success: true, booking });
  } catch (err) {
    serverError(res);
  }
});

router.patch('/bookings/:id/payment', async (req, res) => {
  try {
    const { paymentStatus, paymentMethod } = req.body;
    if (!PAYMENT_STATUSES.includes(paymentStatus)) return badRequest(res, 'paymentStatus must be pending, paid or partially_paid');
    if (paymentMethod !== undefined && paymentMethod !== null && paymentMethod !== '' && !PAYMENT_METHODS.includes(paymentMethod)) {
      return badRequest(res, 'paymentMethod must be cash, card, bank_transfer or mobile_payment');
    }
    const filter = bookingKeyFilter(req.params.id);
    if (!filter) return res.status(404).json({ success: false, message: 'Booking not found' });
    const before = await Booking.findOne({ ...filter, ...NOT_DELETED }).select('bookingId orderNumber paymentStatus paymentMethod').lean();
    if (!before) return res.status(404).json({ success: false, message: 'Booking not found' });

    const update = { $set: { paymentStatus } };
    if (PAYMENT_METHODS.includes(paymentMethod)) update.$set.paymentMethod = paymentMethod;
    else if (paymentMethod === null || paymentMethod === '') update.$unset = { paymentMethod: 1 };
    const booking = await Booking.findOneAndUpdate({ _id: before._id, ...NOT_DELETED }, update, { new: true, runValidators: true })
      .select('bookingId orderNumber paymentStatus paymentMethod updatedAt')
      .lean();
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    await AuditLog.record({
      actor: req.user.id, action: 'booking.payment',
      target: { kind: 'booking', id: String(before._id), label: bookingLabel(before) },
      before: { paymentStatus: before.paymentStatus, paymentMethod: before.paymentMethod || null },
      after: { paymentStatus: booking.paymentStatus, paymentMethod: booking.paymentMethod || null },
    });
    res.json({ success: true, message: 'Payment updated', booking });
  } catch (err) {
    serverError(res);
  }
});

// Soft delete: the booking stays in the database (deletedAt/deletedBy) but disappears from every admin list.
router.delete('/bookings/:id', async (req, res) => {
  try {
    const filter = bookingKeyFilter(req.params.id);
    if (!filter) return res.status(404).json({ success: false, message: 'Booking not found' });
    const fields = 'bookingId orderNumber status deletedAt totalAmount currency';
    const booking = await Booking.findOne(filter).select(fields).lean();
    const refused = deleteDecision(booking);
    if (refused) return res.status(refused.status).json(refused.body);

    // Conditioned on the state we just checked, so a booking that changed status in the meantime is not deleted.
    const deletedAt = new Date();
    const updated = await Booking.findOneAndUpdate(
      { _id: booking._id, status: { $in: DELETABLE_STATUSES }, ...NOT_DELETED },
      { $set: { deletedAt, deletedBy: req.user.id } },
      { new: true, strict: false }
    ).select(fields).lean();
    if (!updated) {
      const again = deleteDecision(await Booking.findOne({ _id: booking._id }).select(fields).lean());
      return res.status(again ? again.status : 409).json(again ? again.body : { success: false, message: 'Booking was already changed' });
    }

    await AuditLog.record({
      actor: req.user.id, action: 'booking.delete',
      target: { kind: 'booking', id: String(booking._id), label: bookingLabel(booking) },
      before: { status: booking.status, totalAmount: booking.totalAmount || 0, currency: booking.currency || null },
      after: { deletedAt },
    });
    console.warn(`🗑️ AUDIT booking soft-deleted by admin ${req.user.id}: ${bookingLabel(booking)} (${booking.status})`);
    res.json({ success: true, message: 'Booking deleted' });
  } catch (err) {
    serverError(res);
  }
});

// ============================================
// TECHNICIANS (for the assign picker)
// ============================================
router.get('/technicians', async (req, res) => {
  try {
    const users = await User.find({ role: 'technician' }).select('fullName phone email isVerified').sort({ fullName: 1 }).lean();
    const ids = users.map((u) => u._id);
    const [profiles, jobs] = await Promise.all([
      Technician.find({ user: { $in: ids } }).select('user skills availability active rating completedJobs').lean(),
      Booking.aggregate([
        { $match: { technician: { $in: ids }, status: { $in: WORKING_STATUSES }, ...NOT_DELETED } },
        { $group: { _id: '$technician', n: { $sum: 1 } } },
      ]),
    ]);
    const profileOf = new Map(profiles.map((p) => [String(p.user), p]));
    const jobsOf = new Map(jobs.map((j) => [String(j._id), j.n]));
    const technicians = users.map((u) => {
      const p = profileOf.get(String(u._id));
      return {
        _id: u._id,
        name: u.fullName,
        phone: u.phone || null,
        email: u.email || null,
        specialties: p?.skills || [],
        // No technician profile means the account was never set up for jobs: shown, but not assignable.
        availability: !!p && p.availability !== false,
        active: !!p && p.active !== false && u.isVerified !== false,
        hasProfile: !!p,
        rating: p?.rating ?? null,
        completedJobs: p?.completedJobs ?? 0,
        activeJobs: jobsOf.get(String(u._id)) || 0,
      };
    });
    res.json({ success: true, technicians });
  } catch (err) {
    serverError(res);
  }
});

// ============================================
// USERS
// ============================================
const buildUserSearch = (raw) => {
  const q = typeof raw === 'string' ? raw.trim().slice(0, 100) : '';
  if (!q) return {};
  const rx = new RegExp(escapeRegex(q), 'i');
  const or = [{ fullName: rx }, { email: rx }, { phone: rx }];
  const digits = phoneSearchDigits(q);
  if (digits) or.push({ phone: new RegExp(escapeRegex(digits)) });
  return { $or: or };
};

// Bookings per user, matched the same way as /users/:userId/bookings (account, phone or email).
const bookingsCountFor = async (users) => {
  if (!users.length) return new Map();
  const ids = users.map((u) => u._id);
  const phones = users.map((u) => u.phone).filter(Boolean);
  const emails = users.map((u) => u.email).filter(Boolean);
  const groups = await Booking.aggregate([
    { $match: { ...NOT_DELETED, $or: [{ user: { $in: ids } }, { phone: { $in: phones } }, { email: { $in: emails } }] } },
    { $group: { _id: { user: '$user', phone: '$phone', email: '$email' }, n: { $sum: 1 } } },
  ]);
  const counts = new Map();
  for (const u of users) {
    const n = groups
      .filter((g) => String(g._id.user) === String(u._id) || (u.phone && g._id.phone === u.phone) || (u.email && g._id.email === u.email))
      .reduce((sum, g) => sum + g.n, 0);
    counts.set(String(u._id), n);
  }
  return counts;
};

router.get('/users', async (req, res) => {
  try {
    const role = queryStr(req.query.role);
    const q = queryStr(req.query.q);
    if (role === null || q === null) return badRequest(res, 'Invalid query');
    if (role && role !== 'all' && !ROLES.includes(role)) return badRequest(res, 'Unknown role');
    const { page, limit, skip } = pageParams(req);
    const search = buildUserSearch(q);
    const filter = { ...search, ...(ROLES.includes(role) ? { role } : {}) };
    const [users, total, roleRows] = await Promise.all([
      User.find(filter)
        .select('fullName email phone role isVerified authProvider createdAt')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
      User.aggregate([{ $match: search }, { $group: { _id: '$role', n: { $sum: 1 } } }]),
    ]);
    const bookingCounts = await bookingsCountFor(users);
    const counts = { all: 0, customer: 0, technician: 0, admin: 0 };
    for (const r of roleRows) { if (r._id in counts) counts[r._id] = r.n; counts.all += r.n; }
    res.json({
      success: true,
      users: users.map((u) => ({
        _id: u._id, fullName: u.fullName, email: u.email || null, phone: u.phone || null, role: u.role,
        isVerified: !!u.isVerified, authProvider: u.authProvider || 'local', createdAt: u.createdAt,
        bookingsCount: bookingCounts.get(String(u._id)) || 0,
      })),
      ...pageInfo(total, page, limit),
      counts,
    });
  } catch (err) {
    serverError(res);
  }
});

router.get('/users/:userId/bookings', async (req, res) => {
  try {
    if (!isObjectId(req.params.userId)) return res.status(404).json({ success: false, message: 'User not found' });
    const userData = await User.findById(req.params.userId).select('phone email');
    if (!userData) return res.status(404).json({ success: false, message: 'User not found' });
    const conditions = [{ user: req.params.userId }];
    if (userData.phone) conditions.push({ phone: userData.phone });
    if (userData.email) conditions.push({ email: userData.email });

    const { page, limit, skip } = pageParams(req, 50);
    const filter = { ...NOT_DELETED, $or: conditions };
    const [bookings, total] = await Promise.all([
      Booking.find(filter).select(Object.keys(BOOKING_LIST_PROJECTION).join(' ')).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Booking.countDocuments(filter),
    ]);
    res.json({ success: true, bookings, ...pageInfo(total, page, limit), pagination: pageInfo(total, page, limit) });
  } catch (err) {
    serverError(res);
  }
});

// ============================================
// SERVICES (admin view includes inactive ones; writes go through /api/services)
// ============================================
router.get('/services', async (req, res) => {
  try {
    const services = await Service.find({}).sort({ active: -1, category: 1, name: 1 }).lean();
    res.json({ success: true, services });
  } catch (err) {
    serverError(res);
  }
});

// ============================================
// REVIEWS (stored on the booking as customerFeedback)
// ============================================
const REVIEWED = { 'customerFeedback.rating': { $gte: 1 }, ...NOT_DELETED };

router.get('/reviews', async (req, res) => {
  try {
    const status = queryStr(req.query.status) || 'all';
    if (!['pending', 'approved', 'all'].includes(status)) return badRequest(res, 'status must be pending, approved or all');
    const { page, limit, skip } = pageParams(req);
    const filter = { ...REVIEWED };
    if (status === 'pending') filter['customerFeedback.approved'] = { $ne: true };
    if (status === 'approved') filter['customerFeedback.approved'] = true;

    const [rows, total, summary] = await Promise.all([
      Booking.find(filter)
        .select('bookingId orderNumber customerName customerFeedback service serviceDetails createdAt')
        .sort({ 'customerFeedback.date': -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Booking.countDocuments(filter),
      Booking.aggregate([
        { $match: REVIEWED },
        {
          $group: {
            _id: null,
            average: { $avg: '$customerFeedback.rating' },
            all: { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ['$customerFeedback.approved', true] }, 1, 0] } },
          },
        },
      ]),
    ]);
    const s = summary[0] || { all: 0, approved: 0 };
    const reviews = rows.map((b) => {
      const svc = b.service && typeof b.service === 'object' ? b.service : {};
      return {
        _id: b._id,
        bookingId: b.bookingId || b.orderNumber || null,
        customerName: b.customerFeedback?.name || b.customerName || null,
        serviceName: b.serviceDetails?.name || svc.name || null,
        serviceNameAr: svc.name_ar || svc.nameAr || null,
        rating: b.customerFeedback?.rating ?? null,
        comment: b.customerFeedback?.comment || '',
        date: b.customerFeedback?.date || null,
        approved: b.customerFeedback?.approved === true,
      };
    });
    res.json({
      success: true,
      reviews,
      ...pageInfo(total, page, limit),
      average: s.all ? roundAvg(s.average) : null,
      counts: { all: s.all, approved: s.approved, pending: s.all - s.approved },
    });
  } catch (err) {
    serverError(res);
  }
});

router.put('/reviews/:id/approve', async (req, res) => {
  try {
    const { approved } = req.body;
    if (typeof approved !== 'boolean') return badRequest(res, 'approved must be true or false');
    if (!isObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Review not found' });
    const before = await Booking.findOne({ _id: req.params.id, ...REVIEWED }).select('bookingId orderNumber customerFeedback.approved').lean();
    if (!before) return res.status(404).json({ success: false, message: 'Review not found' });
    await Booking.updateOne({ _id: before._id }, { $set: { 'customerFeedback.approved': approved } });
    await AuditLog.record({
      actor: req.user.id, action: 'review.approve',
      target: { kind: 'review', id: String(before._id), label: bookingLabel(before) },
      before: { approved: before.customerFeedback?.approved === true },
      after: { approved },
    });
    res.json({ success: true, message: approved ? 'Review approved' : 'Review hidden', approved });
  } catch (err) {
    serverError(res);
  }
});

// ============================================
// INQUIRIES (contact form) AND GENERAL RATINGS
// ============================================
router.get('/inquiries', async (req, res) => {
  try {
    const status = queryStr(req.query.status) || 'all';
    if (!['new', 'handled', 'all'].includes(status)) return badRequest(res, 'status must be new, handled or all');
    const { page, limit, skip } = pageParams(req);
    const filter = status === 'all' ? {} : { status };
    const [inquiries, total, rows] = await Promise.all([
      Inquiry.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      Inquiry.countDocuments(filter),
      Inquiry.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);
    const counts = { new: 0, handled: 0 };
    for (const r of rows) if (r._id in counts) counts[r._id] = r.n;
    res.json({ success: true, inquiries, ...pageInfo(total, page, limit), counts });
  } catch {
    res.status(500).json({ success: false, message: 'Could not load inquiries' });
  }
});

router.patch('/inquiries/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['new', 'handled'].includes(status)) return badRequest(res, 'status must be new or handled');
    if (!isObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Inquiry not found' });
    const before = await Inquiry.findById(req.params.id).select('status name').lean();
    if (!before) return res.status(404).json({ success: false, message: 'Inquiry not found' });
    const inquiry = await Inquiry.findByIdAndUpdate(req.params.id, { $set: { status } }, { new: true }).lean();
    if (!inquiry) return res.status(404).json({ success: false, message: 'Inquiry not found' });
    if (before.status !== status) {
      await AuditLog.record({
        actor: req.user.id, action: 'inquiry.status',
        target: { kind: 'inquiry', id: String(before._id) },
        before: { status: before.status }, after: { status },
      });
    }
    res.json({ success: true, inquiry });
  } catch {
    res.status(500).json({ success: false, message: 'Could not update inquiry' });
  }
});

router.get('/ratings', async (req, res) => {
  try {
    const { page, limit, skip } = pageParams(req);
    const [ratings, total, summary] = await Promise.all([
      GeneralRating.find().sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      GeneralRating.countDocuments(),
      GeneralRating.aggregate([{ $group: { _id: null, average: { $avg: '$rating' } } }]),
    ]);
    res.json({ success: true, ratings, ...pageInfo(total, page, limit), average: total ? roundAvg(summary[0]?.average) : null });
  } catch {
    res.status(500).json({ success: false, message: 'Could not load ratings' });
  }
});

// Service writes live in routes/services.js (validated, admin only): /api/services

module.exports = router;
// Pure helpers, exported for the tests.
module.exports.helpers = {
  escapeRegex, phoneSearchDigits, buildBookingSearch, parseBookingsQuery, buildBookingsPipeline,
  buildStatsPipeline, shapeStats, statusCounts, riyadhNow, deleteDecision, bookingKeyFilter,
  overdueMatch, UNASSIGNED_MATCH,
};
