const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const auth = require('../middleware/auth');
const Notification = require('../models/Notification');
const User = require('../models/User');

const router = express.Router();
const MAX_TOKENS = 5;
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v)) && /^[a-f\d]{24}$/i.test(String(v));
const tokenOk = (t) => typeof t === 'string' && t.trim().length >= 10 && t.length <= 4096;

const tokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

router.use(auth);

const serialize = (n) => ({
  _id: n._id, id: n._id, type: n.type, title: n.title, message: n.message,
  data: n.data || {}, read: !!n.read, priority: n.priority, createdAt: n.createdAt,
});

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const filter = { user: req.user.id };
    if (req.query.unread === 'true') filter.read = false;
    else if (req.query.unread === 'false') filter.read = true;
    const [items, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit + 1).lean(),
      Notification.countDocuments({ user: req.user.id, read: false }),
    ]);
    const hasMore = items.length > limit;
    res.json({ success: true, notifications: items.slice(0, limit).map(serialize), unreadCount, page, hasMore });
  } catch (e) {
    console.error('Notifications list error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/unread-count', async (req, res) => {
  try {
    const count = await Notification.countDocuments({ user: req.user.id, read: false });
    res.json({ success: true, count });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/read-all', async (req, res) => {
  try {
    const r = await Notification.updateMany({ user: req.user.id, read: false }, { $set: { read: true } });
    res.json({ success: true, modified: r.modifiedCount || 0 });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/push-token', tokenLimiter, async (req, res) => {
  try {
    const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';
    if (!tokenOk(token)) return res.status(400).json({ success: false, message: 'Valid token required' });
    const platform = ['android', 'ios'].includes(req.body.platform) ? req.body.platform : 'android';
    const kind = ['fcm', 'expo'].includes(req.body.kind) ? req.body.kind : (/^Expo(nent)?PushToken\[/.test(token) ? 'expo' : 'fcm');

    // A device token belongs to one account at a time (shared phone, different login).
    await User.updateMany({ _id: { $ne: req.user.id }, 'pushTokens.token': token }, { $pull: { pushTokens: { token } } });

    const user = await User.findById(req.user.id).select('pushTokens');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const others = (user.pushTokens || []).filter((t) => t.token !== token);
    others.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
    const kept = others.slice(-(MAX_TOKENS - 1));
    kept.push({ token, platform, kind, updatedAt: new Date() });
    await User.updateOne({ _id: req.user.id }, { $set: { pushTokens: kept } });
    res.json({ success: true, message: 'Push token saved' });
  } catch (e) {
    console.error('Push token save error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/push-token', tokenLimiter, async (req, res) => {
  try {
    const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';
    if (!tokenOk(token)) return res.status(400).json({ success: false, message: 'Valid token required' });
    await User.updateOne({ _id: req.user.id }, { $pull: { pushTokens: { token } } });
    res.json({ success: true, message: 'Push token removed' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id/read', async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id' });
    const n = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, { $set: { read: true } }, { new: true }).lean();
    if (!n) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true, notification: serialize(n) });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/', async (req, res) => {
  try {
    const r = await Notification.deleteMany({ user: req.user.id });
    res.json({ success: true, deleted: r.deletedCount || 0 });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id' });
    const r = await Notification.deleteOne({ _id: req.params.id, user: req.user.id });
    if (!r.deletedCount) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
