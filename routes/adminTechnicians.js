// Admin panel: technicians (management, assign picker, commission ledger) and app settings.
// Mounted inside routes/admin.js after adminAuth, so every route here is admin-only.
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Booking = require('../models/Booking');
const Technician = require('../models/Technician');
const CommissionSettlement = require('../models/CommissionSettlement');
const AppSetting = require('../models/AppSetting');
const AuditLog = require('../models/AuditLog');
const technicianStats = require('../utils/technicianStats');
const { getCommissionRate, validRate, round2 } = require('../utils/commission');
const { validateAnyPhone, normalizeAnyPhone, phoneVariants } = require('../utils/phone');
const { normEmail, isEmail, cleanStr } = require('../utils/security');

const NOT_DELETED = { deletedAt: null };
const TECH_CITIES = ['jeddah', 'makkah'];
const TECH_SPECIALTIES = ['ac', 'refrigerator', 'washing-machine', 'stove', 'general'];
const LEGACY_SKILLS = ['freezer', 'electronics']; // still valid on old profiles, no longer offered
const SETTLEMENT_METHODS = ['cash', 'bank_transfer', 'other'];
const MAX_SETTLEMENT = 1000000;

const isObjectId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);
const serverError = (res) => res.status(500).json({ success: false, message: 'Server error' });
const badRequest = (res, message) => res.status(400).json({ success: false, message });
const techNotFound = (res) => res.status(404).json({ success: false, message: 'Technician not found' });

const uniqueList = (value, allowed, label) => {
  if (!Array.isArray(value) || value.length > 20) return { error: `${label} must be a list` };
  const list = [...new Set(value)];
  if (list.some((v) => typeof v !== 'string' || !allowed.includes(v))) return { error: `${label} must be from: ${allowed.join(', ')}` };
  return { value: list };
};

// Validates the create (partial = false) or edit (partial = true) body.
// Returns { error } or { values } holding only the fields that were sent (create: every field, defaults applied).
const parseTechnicianInput = (body = {}, { partial = false } = {}) => {
  const values = {};
  const has = (k) => body[k] !== undefined;
  if (!partial || has('fullName')) {
    const name = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    if (name.length < 2 || name.length > 100) return { error: 'Full name must be 2 to 100 characters' };
    values.fullName = name;
  }
  if (!partial || has('phone')) {
    // Any mobile number (Saudi or another country) can be a technician's login
    const check = validateAnyPhone(body.phone);
    if (!check.valid) return { error: check.msg };
    values.phone = normalizeAnyPhone(body.phone);
  }
  if (has('email') && body.email !== null && body.email !== '') {
    const email = normEmail(body.email);
    if (!isEmail(email)) return { error: 'Please enter a valid email' };
    values.email = email;
  } else if (partial && (body.email === null || body.email === '')) {
    values.email = null; // edit: remove the email
  }
  if (!partial || has('password')) {
    if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 72) {
      return { error: 'Password must be 8 to 72 characters' };
    }
    values.password = body.password;
  }
  if (!partial || has('cities')) {
    const r = uniqueList(has('cities') ? body.cities : [], TECH_CITIES, 'cities');
    if (r.error) return r;
    values.cities = r.value;
  }
  if (!partial || has('specialties')) {
    const r = uniqueList(has('specialties') ? body.specialties : [], TECH_SPECIALTIES, 'specialties');
    if (r.error) return r;
    values.specialties = r.value;
  }
  for (const [key, def] of [['autoAssign', false], ['active', true], ['availability', true]]) {
    if (has(key)) {
      if (typeof body[key] !== 'boolean') return { error: `${key} must be true or false` };
      values[key] = body[key];
    } else if (!partial) values[key] = def;
  }
  if (partial && !Object.keys(values).length) return { error: 'Nothing to update' };
  return { values };
};

const shapeTechnician = (u, p, stats) => {
  const s = stats || { ...technicianStats.EMPTY_STATS };
  return {
    _id: u._id,
    name: u.fullName,
    phone: u.phone || null,
    email: u.email || null,
    cities: p?.cities || [],
    specialties: (p?.skills || []).filter((x) => !LEGACY_SKILLS.includes(x)),
    autoAssign: !!p && p.autoAssign === true,
    // No technician profile means the account was never set up for jobs: shown, but not assignable.
    active: !!p && p.active !== false && u.isVerified !== false,
    availability: !!p && p.availability !== false,
    hasProfile: !!p,
    stats: {
      activeJobs: s.activeJobs, pendingJobs: s.pendingJobs, completedToday: s.completedToday, completedMonth: s.completedMonth,
      completedTotal: s.completedTotal, revenueTotal: s.revenueTotal, commissionTotal: s.commissionTotal,
      commissionPaid: s.commissionPaid, commissionDue: s.commissionDue,
    },
    // Kept for the older assign picker: open jobs (assigned + on the way + in progress), rating, completed count.
    activeJobs: s.activeJobs + s.pendingJobs,
    rating: p?.rating ?? null,
    completedJobs: p?.completedJobs ?? 0,
  };
};

// Small audit summary (never the password).
const auditView = (t) => ({
  name: t.name, phone: t.phone, email: t.email, cities: t.cities, specialties: t.specialties,
  autoAssign: t.autoAssign, active: t.active, availability: t.availability,
});

const loadTechnician = async (id) => {
  if (!isObjectId(id)) return null;
  const user = await User.findOne({ _id: id, role: 'technician' }).select('fullName phone email isVerified').lean();
  if (!user) return null;
  const profile = await Technician.findOne({ user: user._id }).lean();
  return { user, profile };
};

const statsOf = async (id) => (await technicianStats.statsFor([id])).get(String(id));

router.get('/technicians', async (req, res) => {
  try {
    const users = await User.find({ role: 'technician' }).select('fullName phone email isVerified').sort({ fullName: 1 }).lean();
    const ids = users.map((u) => u._id);
    const [profiles, stats] = await Promise.all([
      Technician.find({ user: { $in: ids } }).select('user skills cities autoAssign availability active rating completedJobs').lean(),
      technicianStats.statsFor(ids),
    ]);
    const profileOf = new Map(profiles.map((p) => [String(p.user), p]));
    res.json({ success: true, technicians: users.map((u) => shapeTechnician(u, profileOf.get(String(u._id)), stats.get(String(u._id)))) });
  } catch (err) {
    console.error('Admin technicians list error:', err.message);
    serverError(res);
  }
});

const duplicateMessage = 'An account with this phone number or email already exists';
const STAFF_ROLES = ['technician', 'admin'];

// Technician accounts are created from the app only: the technician applies there and an admin approves the
// application (routes/adminApplications.js). Nothing is created from the website or the admin panel any more.
router.post('/technicians', (req, res) => res.status(403).json({
  success: false,
  message: 'Technician accounts are created from the app. Ask the technician to apply there, then approve the application under Technician applications.',
  messageAr: 'يتم إنشاء حسابات الفنيين من التطبيق فقط. اطلب من الفني التقديم من التطبيق ثم وافق على الطلب من صفحة طلبات الفنيين.',
}));

router.patch('/technicians/:id', async (req, res) => {
  try {
    const found = await loadTechnician(req.params.id);
    if (!found) return techNotFound(res);
    const parsed = parseTechnicianInput(req.body, { partial: true });
    if (parsed.error) return badRequest(res, parsed.error);
    const v = parsed.values;
    const beforeView = auditView(shapeTechnician(found.user, found.profile, null));
    const id = found.user._id;

    if (v.phone && await User.findOne({ phone: { $in: phoneVariants(v.phone) }, role: { $in: STAFF_ROLES }, _id: { $ne: id } }).select('_id').lean()) {
      return res.status(409).json({ success: false, message: 'Another technician already uses this phone number' });
    }
    if (v.email && await User.findOne({ email: v.email, _id: { $ne: id } }).select('_id').lean()) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }

    const user = await User.findById(id);
    if (!user) return techNotFound(res);
    if (v.fullName !== undefined) user.fullName = v.fullName;
    if (v.phone !== undefined) { user.phone = v.phone; user.isPhoneVerified = true; }
    if (v.email !== undefined) user.email = v.email || undefined;
    if (v.password !== undefined) {
      user.password = v.password; // the pre-save hook hashes it and bumps passwordChangedAt (old sessions end)
      if (user.authProvider !== 'phone') { user.authProvider = 'phone'; user.isPhoneVerified = true; }
    }
    await user.save();

    const $set = { updatedAt: new Date() };
    if (v.cities !== undefined) $set.cities = v.cities;
    if (v.specialties !== undefined) $set.skills = v.specialties;
    for (const k of ['autoAssign', 'active', 'availability']) if (v[k] !== undefined) $set[k] = v[k];
    const profile = await Technician.findOneAndUpdate(
      { user: id }, { $set }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();

    const technician = shapeTechnician(user.toObject(), profile, await statsOf(id));
    await AuditLog.record({
      actor: req.user.id, action: 'technician.update',
      target: { kind: 'technician', id: String(id), label: user.fullName },
      before: beforeView, after: { ...auditView(technician), ...(v.password !== undefined ? { passwordReset: true } : {}) },
    });
    res.json({ success: true, message: 'Technician updated', technician });
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ success: false, message: duplicateMessage });
    console.error('Admin technician update error:', err.message);
    serverError(res);
  }
});

const SETTLEMENT_FIELDS = 'technician amount method note createdBy createdAt';
const findSettlements = (technicianId, limit) => CommissionSettlement.find({ technician: technicianId })
  .select(SETTLEMENT_FIELDS).populate('createdBy', 'fullName').sort({ createdAt: -1, _id: -1 }).limit(limit).lean();

const shapeJob = (b) => {
  const svc = b.service && typeof b.service === 'object' ? b.service : {};
  return {
    _id: b._id, orderNumber: b.orderNumber, bookingId: b.bookingId || null, status: b.status,
    date: b.date || null, time: b.time || null, totalAmount: b.totalAmount || 0, currency: b.currency || 'SAR',
    customerName: b.customerName || null, city: b.city || '',
    service: { name: svc.name || b.serviceDetails?.name || null, nameAr: svc.name_ar || svc.nameAr || null, category: svc.category || b.serviceDetails?.category || null },
    assignedBy: b.assignedBy || null, assignedAt: b.assignedAt || null,
    completion: b.completion || null, commission: b.commission || null, updatedAt: b.updatedAt,
  };
};

router.get('/technicians/:id', async (req, res) => {
  try {
    const found = await loadTechnician(req.params.id);
    if (!found) return techNotFound(res);
    const id = found.user._id;
    const [stats, jobs, settlements] = await Promise.all([
      statsOf(id),
      Booking.find({ technician: id, ...NOT_DELETED })
        .select('orderNumber bookingId status date time totalAmount currency customerName city service serviceDetails assignedBy assignedAt completion commission updatedAt')
        .sort({ updatedAt: -1 }).limit(50).lean(),
      findSettlements(id, 200),
    ]);
    res.json({ success: true, technician: shapeTechnician(found.user, found.profile, stats), jobs: jobs.map(shapeJob), settlements });
  } catch (err) {
    console.error('Admin technician detail error:', err.message);
    serverError(res);
  }
});

router.get('/technicians/:id/settlements', async (req, res) => {
  try {
    const found = await loadTechnician(req.params.id);
    if (!found) return techNotFound(res);
    const [settlements, stats] = await Promise.all([findSettlements(found.user._id, 500), statsOf(found.user._id)]);
    res.json({ success: true, settlements, commissionTotal: stats.commissionTotal, commissionPaid: stats.commissionPaid, commissionDue: stats.commissionDue });
  } catch (err) {
    serverError(res);
  }
});

// Validates a settlement body. Returns { error } or { values: { amount, method, note } }.
const parseSettlementInput = (body = {}) => {
  const raw = typeof body.amount === 'string' && body.amount.trim() !== '' ? Number(body.amount.trim()) : body.amount;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || round2(raw) <= 0 || raw > MAX_SETTLEMENT) {
    return { error: 'Amount must be a number greater than 0' };
  }
  const method = body.method === undefined || body.method === null || body.method === '' ? 'cash' : body.method;
  if (!SETTLEMENT_METHODS.includes(method)) return { error: 'method must be cash, bank_transfer or other' };
  if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') return { error: 'note must be text' };
  if (typeof body.note === 'string' && body.note.trim().length > 500) return { error: 'note must be at most 500 characters' };
  return { values: { amount: round2(raw), method, note: cleanStr(body.note, 500) } };
};

router.post('/technicians/:id/settlements', async (req, res) => {
  try {
    const found = await loadTechnician(req.params.id);
    if (!found) return techNotFound(res);
    const parsed = parseSettlementInput(req.body);
    if (parsed.error) return badRequest(res, parsed.error);
    const settlement = await CommissionSettlement.create({
      technician: found.user._id, ...parsed.values, createdBy: req.user.id, createdAt: new Date(),
    });
    const stats = await statsOf(found.user._id);
    await AuditLog.record({
      actor: req.user.id, action: 'technician.settlement',
      target: { kind: 'technician', id: String(found.user._id), label: found.user.fullName },
      after: { amount: settlement.amount, method: settlement.method, commissionDue: stats.commissionDue },
    });
    res.status(201).json({
      success: true, message: 'Payment recorded', settlement: settlement.toObject(),
      commissionTotal: stats.commissionTotal, commissionPaid: stats.commissionPaid, commissionDue: stats.commissionDue,
    });
  } catch (err) {
    console.error('Admin settlement error:', err.message);
    serverError(res);
  }
});

// ============================================
// SETTINGS (commission rate)
// ============================================
router.get('/settings', async (req, res) => {
  try {
    res.json({ success: true, commissionRate: await getCommissionRate() });
  } catch {
    serverError(res);
  }
});

router.put('/settings', async (req, res) => {
  try {
    const rate = req.body.commissionRate;
    if (!validRate(rate)) return badRequest(res, 'commissionRate must be a number from 0 to 0.5 (0.07 = 7%)');
    const commissionRate = Math.round(rate * 10000) / 10000;
    const before = await getCommissionRate();
    await AppSetting.findOneAndUpdate(
      { key: 'app' },
      { $set: { commissionRate, updatedBy: req.user.id } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    if (before !== commissionRate) {
      await AuditLog.record({ actor: req.user.id, action: 'settings.update', target: { kind: 'settings', id: 'app' }, before: { commissionRate: before }, after: { commissionRate } });
    }
    res.json({ success: true, message: 'Settings saved', commissionRate });
  } catch (err) {
    console.error('Admin settings error:', err.message);
    serverError(res);
  }
});

module.exports = router;
module.exports.helpers = { parseTechnicianInput, parseSettlementInput, shapeTechnician, TECH_CITIES, TECH_SPECIALTIES };
