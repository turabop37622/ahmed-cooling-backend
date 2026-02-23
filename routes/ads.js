// backend/routes/ads.js

const express = require('express');
const router  = express.Router();
const Ad      = require('../models/Ad');

// ── Middleware: simple token check ───────────────────────────
const authMiddleware = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  // Aapka existing JWT verify logic yahan add karo
  // Example: const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
  // req.userId = decoded.id;
  req.userId = req.headers['x-user-id']; // temporary — replace with JWT
  next();
};

// ── POST /api/ads ────────────────────────────────────────────
// Naya ad post karo (status: pending by default)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      categoryId, categoryLabel, brand, model, variant,
      variantLabel, condition, price, description,
      location, phone, images,
    } = req.body;

    const ad = await Ad.create({
      userId: req.userId,
      categoryId, categoryLabel, brand, model, variant,
      variantLabel, condition,
      price: Number(price),
      description, location, phone,
      images: images || [],
      status: 'pending',
    });

    res.status(201).json({ success: true, message: 'Ad submitted. Pending admin approval.', data: ad });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/ads/my-ads ──────────────────────────────────────
// Login user ki apni ads
router.get('/my-ads', authMiddleware, async (req, res) => {
  try {
    const ads = await Ad.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json({ success: true, count: ads.length, data: ads });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/ads/active ──────────────────────────────────────
// Sab active ads (public — home screen ke liye)
router.get('/active', async (req, res) => {
  try {
    const { category, brand } = req.query;
    const filter = { status: 'active' };
    if (category) filter.categoryId = category;
    if (brand)    filter.brand = brand;

    const ads = await Ad.find(filter).sort({ featured: -1, createdAt: -1 });
    res.json({ success: true, count: ads.length, data: ads });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/ads/:id ─────────────────────────────────────────
// Single ad detail + views count
router.get('/:id', async (req, res) => {
  try {
    const ad = await Ad.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    );
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
    res.json({ success: true, data: ad });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/ads/:id ─────────────────────────────────────────
// Ad edit karo (sirf owner)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const ad = await Ad.findOne({ _id: req.params.id, userId: req.userId });
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found or not authorized' });

    const allowed = ['brand','model','variant','condition','price','description','location','phone','images'];
    allowed.forEach(field => {
      if (req.body[field] !== undefined) ad[field] = req.body[field];
    });

    // Agar rejected tha aur edit kiya to pending mein wapas
    if (ad.status === 'rejected') {
      ad.status = 'pending';
      ad.rejectReason = '';
    }

    await ad.save();
    res.json({ success: true, message: 'Ad updated', data: ad });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/ads/:id ──────────────────────────────────────
// Ad delete karo
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const ad = await Ad.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
    res.json({ success: true, message: 'Ad deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/ads/:id/call ────────────────────────────────────
// Call count barhaao
router.put('/:id/call', async (req, res) => {
  try {
    await Ad.findByIdAndUpdate(req.params.id, { $inc: { calls: 1 } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ADMIN ROUTES ─────────────────────────────────────────────

// GET /api/ads/admin/pending — sab pending ads
router.get('/admin/pending', async (req, res) => {
  try {
    const ads = await Ad.find({ status: 'pending' }).sort({ createdAt: 1 });
    res.json({ success: true, count: ads.length, data: ads });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/ads/admin/:id/approve — ad approve karo
router.put('/admin/:id/approve', async (req, res) => {
  try {
    const days = req.body.days || 30;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);

    const ad = await Ad.findByIdAndUpdate(
      req.params.id,
      { status: 'active', rejectReason: '', expiryDate },
      { new: true }
    );
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
    res.json({ success: true, message: 'Ad approved', data: ad });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/ads/admin/:id/reject — ad reject karo
router.put('/admin/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    const ad = await Ad.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected', rejectReason: reason || 'Ad does not meet our guidelines.' },
      { new: true }
    );
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
    res.json({ success: true, message: 'Ad rejected', data: ad });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;