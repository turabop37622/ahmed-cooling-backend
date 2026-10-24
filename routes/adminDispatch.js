// Admin panel: technician wallets (top-ups, ledger), technician cancellation reviews, freezing, and the dispatch
// settings (offer mode on/off, timings). Mounted inside routes/admin.js after adminAuth, so admin-only.
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Technician = require('../models/Technician');
const WalletTransaction = require('../models/WalletTransaction');
const TechnicianCancellation = require('../models/TechnicianCancellation');
const AppSetting = require('../models/AppSetting');
const AuditLog = require('../models/AuditLog');
const wallet = require('../utils/wallet');
const dispatch = require('../utils/dispatch');
const { round2 } = require('../utils/commission');
const cloudinary = require('../utils/cloudinary');
const upload = require('../utils/multer');

const isObjectId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);
const serverError = (res) => res.status(500).json({ success: false, message: 'Server error' });
const badRequest = (res, message) => res.status(400).json({ success: false, message });
const MAX_TOPUP = 100000;
const METHODS = ['cash', 'bank_transfer', 'other'];

const loadTechnician = async (id) => {
  if (!isObjectId(id)) return null;
  return User.findOne({ _id: id, role: 'technician' }).select('fullName phone').lean();
};

// ---------- wallets ----------

// Every technician with their wallet balance, freeze state and counters (the admin "Wallets" page).
router.get('/wallets', async (req, res) => {
  try {
    const users = await User.find({ role: 'technician' }).select('fullName phone').sort({ fullName: 1 }).lean();
    const ids = users.map((u) => u._id);
    const [profiles, balances, pending, photos] = await Promise.all([
      Technician.find({ user: { $in: ids } }).select('user frozenUntil frozenReason lateCount active').lean(),
      wallet.balances(ids),
      TechnicianCancellation.aggregate([
        { $match: { technician: { $in: ids }, reviewStatus: { $in: ['pending', 'deferred'] } } },
        { $group: { _id: '$technician', held: { $sum: '$holdAmount' }, count: { $sum: 1 } } },
      ]),
      User.find({ _id: { $in: ids } }).select('profileImage').lean(),
    ]);
    const photoOf = new Map(photos.map((u) => [String(u._id), u.profileImage || '']));
    const profileOf = new Map(profiles.map((p) => [String(p.user), p]));
    const pendingOf = new Map(pending.map((p) => [String(p._id), p]));
    const now = new Date();
    res.json({
      success: true,
      wallets: users.map((u) => {
        const p = profileOf.get(String(u._id)) || {};
        const hold = pendingOf.get(String(u._id));
        return {
          technicianId: String(u._id), name: u.fullName, phone: u.phone || null, photo: photoOf.get(String(u._id)) || '',
          balance: balances.get(String(u._id)) || 0,
          underReview: hold ? round2(hold.held) : 0, reviewCount: hold ? hold.count : 0,
          frozenUntil: p.frozenUntil && new Date(p.frozenUntil) > now ? p.frozenUntil : null,
          frozenReason: p.frozenUntil && new Date(p.frozenUntil) > now ? p.frozenReason || '' : '',
          lateCount: p.lateCount || 0, active: p.active !== false,
        };
      }),
    });
  } catch (err) {
    console.error('Admin wallets error:', err.message);
    serverError(res);
  }
});

router.get('/wallets/:id', async (req, res) => {
  try {
    const user = await loadTechnician(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Technician not found' });
    const [balance, transactions] = await Promise.all([
      wallet.balanceOf(user._id),
      WalletTransaction.find({ technician: user._id }).sort({ createdAt: -1 }).limit(200).lean(),
    ]);
    res.json({ success: true, technician: { id: String(user._id), name: user.fullName, phone: user.phone || null }, balance, transactions });
  } catch (err) {
    serverError(res);
  }
});

// Record money the technician paid in (cash or bank transfer). `amount` is positive.
router.post('/wallets/:id/topup', async (req, res) => {
  try {
    const user = await loadTechnician(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Technician not found' });
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_TOPUP) return badRequest(res, `Amount must be between 0 and ${MAX_TOPUP}`);
    const method = METHODS.includes(req.body.method) ? req.body.method : 'cash';
    const note = String(req.body.note || '').trim().slice(0, 500);
    const tx = await wallet.record({ technician: user._id, type: 'topup', amount: round2(amount), method, note, createdBy: req.user.id });
    const balance = await wallet.balanceOf(user._id);
    await AuditLog.record({
      actor: req.user.id, action: 'wallet.topup',
      target: { kind: 'technician', id: String(user._id), label: user.fullName },
      after: { amount: tx.amount, method, balance },
    });
    res.status(201).json({ success: true, message: 'Top-up recorded', transaction: tx, balance });
  } catch (err) {
    console.error('Admin top-up error:', err.message);
    serverError(res);
  }
});

// Manual correction (+ or -), always with a note.
router.post('/wallets/:id/adjust', async (req, res) => {
  try {
    const user = await loadTechnician(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Technician not found' });
    const amount = Number(req.body.amount);
    const note = String(req.body.note || '').trim().slice(0, 500);
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_TOPUP) return badRequest(res, `Amount must be a non-zero number up to ${MAX_TOPUP}`);
    if (note.length < 3) return badRequest(res, 'A note explaining the correction is required');
    const tx = await wallet.record({ technician: user._id, type: 'adjust', amount: round2(amount), note, createdBy: req.user.id });
    const balance = await wallet.balanceOf(user._id);
    await AuditLog.record({
      actor: req.user.id, action: 'wallet.adjust',
      target: { kind: 'technician', id: String(user._id), label: user.fullName },
      after: { amount: tx.amount, note, balance },
    });
    res.status(201).json({ success: true, message: 'Wallet corrected', transaction: tx, balance });
  } catch (err) {
    serverError(res);
  }
});

// ---------- photo (sent to customers in the "technician assigned" WhatsApp message) ----------

// multipart field "image" (jpeg/png/webp, max 5 MB). Cropped square around the face and stored as JPEG, which is what
// a WhatsApp template image header accepts. The same public_id is reused, so a new photo replaces the old one.
router.post('/technicians/:id/photo', upload.single('image'), async (req, res) => {
  try {
    const user = await loadTechnician(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Technician not found' });
    if (!req.file) return badRequest(res, 'Choose a photo (JPG, PNG or WebP, up to 5 MB)');
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: 'ahmedcooling/technicians', public_id: String(user._id), overwrite: true, invalidate: true, format: 'jpg',
          transformation: [{ width: 640, height: 640, crop: 'fill', gravity: 'face' }],
        },
        (error, out) => (error ? reject(error) : resolve(out))
      ).end(req.file.buffer);
    });
    await User.updateOne({ _id: user._id }, { $set: { profileImage: result.secure_url } });
    await AuditLog.record({ actor: req.user.id, action: 'technician.photo', target: { kind: 'technician', id: String(user._id), label: user.fullName } });
    res.json({ success: true, message: 'Photo saved', photo: result.secure_url });
  } catch (err) {
    console.error('Admin technician photo error:', err.message);
    res.status(500).json({ success: false, message: 'Could not save the photo' });
  }
});

router.delete('/technicians/:id/photo', async (req, res) => {
  try {
    const user = await loadTechnician(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Technician not found' });
    await User.updateOne({ _id: user._id }, { $set: { profileImage: '' } });
    try { await cloudinary.uploader.destroy(`ahmedcooling/technicians/${user._id}`); } catch (e) { console.warn('Technician photo cleanup failed:', e.message); }
    res.json({ success: true, message: 'Photo removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ---------- freeze ----------

router.post('/technicians/:id/freeze', async (req, res) => {
  try {
    const user = await loadTechnician(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Technician not found' });
    const hours = Number(req.body.hours);
    if (!Number.isFinite(hours) || hours < 1 || hours > 24 * 365) return badRequest(res, 'hours must be between 1 and 8760');
    const frozenUntil = new Date(Date.now() + hours * 3600 * 1000);
    const frozenReason = String(req.body.reason || 'Frozen by admin').trim().slice(0, 200);
    await Technician.updateOne({ user: user._id }, { $set: { frozenUntil, frozenReason } });
    await AuditLog.record({ actor: req.user.id, action: 'technician.freeze', target: { kind: 'technician', id: String(user._id), label: user.fullName }, after: { frozenUntil, frozenReason } });
    res.json({ success: true, message: 'Account frozen', frozenUntil });
  } catch (err) {
    serverError(res);
  }
});

router.post('/technicians/:id/unfreeze', async (req, res) => {
  try {
    const user = await loadTechnician(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Technician not found' });
    await Technician.updateOne({ user: user._id }, { $unset: { frozenUntil: 1, frozenReason: 1 } });
    await AuditLog.record({ actor: req.user.id, action: 'technician.unfreeze', target: { kind: 'technician', id: String(user._id), label: user.fullName } });
    res.json({ success: true, message: 'Account unfrozen' });
  } catch (err) {
    serverError(res);
  }
});

// ---------- cancellation reviews ----------

const STATUS_FILTERS = ['pending', 'deferred', 'refunded', 'forfeited'];

router.get('/technician-cancellations', async (req, res) => {
  try {
    const filter = {};
    if (STATUS_FILTERS.includes(req.query.status)) filter.reviewStatus = req.query.status;
    const rows = await TechnicianCancellation.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    const users = await User.find({ _id: { $in: rows.map((r) => r.technician) } }).select('fullName phone').lean();
    const nameOf = new Map(users.map((u) => [String(u._id), u]));
    res.json({
      success: true,
      cancellations: rows.map((r) => ({
        ...r, technicianName: nameOf.get(String(r.technician))?.fullName || '', technicianPhone: nameOf.get(String(r.technician))?.phone || null,
      })),
    });
  } catch (err) {
    serverError(res);
  }
});

router.post('/technician-cancellations/:id/review', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Not found' });
    const result = await dispatch.reviewCancellation(req.params.id, req.body.decision, req.user.id, req.body.note);
    if (!result.ok) return res.status(result.code === 'missing' ? 404 : 400).json({ success: false, message: result.message });
    await AuditLog.record({
      actor: req.user.id, action: 'technician.cancellation_review',
      target: { kind: 'booking', id: String(result.cancellation.booking), label: result.cancellation.orderNumber },
      after: { decision: req.body.decision, holdAmount: result.cancellation.holdAmount },
    });
    res.json({ success: true, message: 'Decision saved', cancellation: result.cancellation });
  } catch (err) {
    console.error('Admin cancellation review error:', err.message);
    serverError(res);
  }
});

// ---------- dispatch settings ----------

const SETTING_LIMITS = {
  openAlertMin: [1, 240],
  lateGraceMin: [1, 240], maxCancelsPerDay: [1, 20], freezeHours: [1, 720], deferDays: [1, 60],
};

router.get('/dispatch-settings', async (req, res) => {
  try {
    res.json({ success: true, settings: await dispatch.getSettings({ fresh: true }) });
  } catch (err) {
    serverError(res);
  }
});

router.put('/dispatch-settings', async (req, res) => {
  try {
    const $set = {};
    if (req.body.offerMode !== undefined) {
      if (typeof req.body.offerMode !== 'boolean') return badRequest(res, 'offerMode must be true or false');
      $set.offerMode = req.body.offerMode;
    }
    for (const [key, [min, max]] of Object.entries(SETTING_LIMITS)) {
      if (req.body[key] === undefined) continue;
      const n = Number(req.body[key]);
      if (!Number.isInteger(n) || n < min || n > max) return badRequest(res, `${key} must be a whole number from ${min} to ${max}`);
      $set[key] = n;
    }
    if (!Object.keys($set).length) return badRequest(res, 'Nothing to change');
    const before = await dispatch.getSettings({ fresh: true });
    await AppSetting.findOneAndUpdate(
      { key: 'app' }, { $set: { ...$set, updatedBy: req.user.id } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    dispatch.clearSettingsCache();
    const after = await dispatch.getSettings({ fresh: true });
    await AuditLog.record({ actor: req.user.id, action: 'settings.dispatch', target: { kind: 'settings', id: 'app' }, before, after });
    res.json({ success: true, message: 'Settings saved', settings: after });
  } catch (err) {
    console.error('Admin dispatch settings error:', err.message);
    serverError(res);
  }
});

module.exports = router;
