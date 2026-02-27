// backend/routes/ads.js
// ✅ Professional level
// ✅ Seller populate | Seller profile | Seller ads | Report ad

const express = require('express');
const router  = express.Router();
const Ad      = require('../models/Ad');
const User    = require('../models/User');
const jwt     = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'mysecretkey';

// ════════════════════════════════════════════════════════════
//  MIDDLEWARE
// ════════════════════════════════════════════════════════════
const authMiddleware = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    req.userId = decoded.id || decoded._id || decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// Optional auth — login ho to userId milega, na ho to bhi chalega
const optionalAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
      req.userId = decoded.id || decoded._id || decoded.userId;
    } catch (_) {}
  }
  next();
};

// ════════════════════════════════════════════════════════════
//  SELLER — fields jo frontend ko chahiye
// ════════════════════════════════════════════════════════════
const SELLER_FIELDS = 'fullName phone email profileImage createdAt';

// ════════════════════════════════════════════════════════════
//  POST /api/ads — Naya ad post karo
// ════════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
  try {
    const {
      userId, categoryId, categoryLabel, brand, model,
      variant, variantLabel, condition, price,
      description, location, phone, images,
    } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId missing' });
    }

    const ad = await Ad.create({
      userId,
      categoryId, categoryLabel,
      brand, model, variant, variantLabel,
      condition,
      price: Number(price),
      description, location, phone,
      images: images || [],
      status: 'pending',
    });

    // ✅ Seller info ke saath wapas bhejo
    const populated = await ad.populate('userId', SELLER_FIELDS);
    res.status(201).json({ success: true, data: populated });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  GET /api/ads/active — Sab active ads
//  Query params: category, brand, seller (userId)
// ════════════════════════════════════════════════════════════
router.get('/active', async (req, res) => {
  try {
    const { category, brand, seller } = req.query;

    const filter = { status: 'active' };
    if (category) filter.categoryId = category;
    if (brand)    filter.brand      = new RegExp(brand, 'i');
    if (seller)   filter.userId     = seller;   // ✅ Seller ke ads filter

    const ads = await Ad
      .find(filter)
      .populate('userId', SELLER_FIELDS)         // ✅ Seller info attach
      .sort({ featured: -1, createdAt: -1 });

    res.json({ success: true, count: ads.length, data: ads });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  GET /api/ads/my-ads — Login user ki apni ads
// ════════════════════════════════════════════════════════════
router.get('/my-ads', authMiddleware, async (req, res) => {
  try {
    const ads = await Ad
      .find({ userId: req.userId })
      .populate('userId', SELLER_FIELDS)
      .sort({ createdAt: -1 });

    res.json({ success: true, count: ads.length, data: ads });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  GET /api/ads/seller/:sellerId — Seller ki public profile + ads
//  ✅ YEH NAI ENDPOINT HAI
// ════════════════════════════════════════════════════════════
router.get('/seller/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;

    // Seller ki basic info (public fields only)
    const seller = await User.findById(sellerId)
      .select('fullName phone email profileImage createdAt');

    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    // Seller ke saare active ads
    const ads = await Ad
      .find({ userId: sellerId, status: 'active' })
      .sort({ featured: -1, createdAt: -1 });

    // Stats calculate karo
    const totalViews = ads.reduce((sum, a) => sum + (a.views || 0), 0);
    const totalCalls = ads.reduce((sum, a) => sum + (a.calls || 0), 0);

    res.json({
      success: true,
      data: {
        seller: {
          _id:          seller._id,
          fullName:     seller.fullName,
          phone:        seller.phone,
          email:        seller.email,
          profileImage: seller.profileImage,
          createdAt:    seller.createdAt,
          memberYear:   new Date(seller.createdAt).getFullYear(),
        },
        stats: {
          totalAds:   ads.length,
          totalViews,
          totalCalls,
        },
        ads,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  GET /api/ads/admin/pending — Pending ads (admin)
// ════════════════════════════════════════════════════════════
router.get('/admin/pending', async (req, res) => {
  try {
    const ads = await Ad
      .find({ status: 'pending' })
      .populate('userId', SELLER_FIELDS)
      .sort({ createdAt: 1 });

    res.json({ success: true, count: ads.length, data: ads });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  GET /api/ads/admin/all — Sab ads (admin only)
//  ✅ Har status + seller info populate
//  Query: ?status=pending|active|rejected|all  ?category=ac
// ════════════════════════════════════════════════════════════
router.get('/admin/all', async (req, res) => {
  try {
    const { status, category } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (category) filter.categoryId = category;

    const ads = await Ad
      .find(filter)
      .populate('userId', SELLER_FIELDS)
      .sort({ createdAt: -1 });

    res.json({ success: true, count: ads.length, data: ads });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  GET /api/ads/admin/users — Sab users + unke ad stats
//  ✅ Admin ke liye user management
// ════════════════════════════════════════════════════════════
router.get('/admin/users', async (req, res) => {
  try {
    // Sab users fetch karo
    const users = await User.find({})
      .select('fullName email phone profileImage createdAt role isVerified')
      .sort({ createdAt: -1 });

    // Har user ke ad stats nikalo
    const userIds = users.map(u => u._id);
    const adStats = await Ad.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $group: {
        _id:      '$userId',
        total:    { $sum: 1 },
        active:   { $sum: { $cond: [{ $eq: ['$status', 'active']   }, 1, 0] } },
        pending:  { $sum: { $cond: [{ $eq: ['$status', 'pending']  }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
        totalCalls:{ $sum: '$calls' },
        totalViews:{ $sum: '$views' },
      }},
    ]);

    // Map stats to users
    const statsMap = {};
    adStats.forEach(s => { statsMap[String(s._id)] = s; });

    const result = users.map(u => ({
      _id:          u._id,
      fullName:     u.fullName,
      email:        u.email,
      phone:        u.phone,
      profileImage: u.profileImage,
      createdAt:    u.createdAt,
      role:         u.role,
      isVerified:   u.isVerified,
      stats: statsMap[String(u._id)] || {
        total: 0, active: 0, pending: 0, rejected: 0, totalCalls: 0, totalViews: 0,
      },
    }));

    res.json({ success: true, count: result.length, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  PUT /api/ads/admin/:id/approve
// ════════════════════════════════════════════════════════════
router.put('/admin/:id/approve', async (req, res) => {
  try {
    const days = req.body.days || 30;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);

    const ad = await Ad.findByIdAndUpdate(
      req.params.id,
      { status: 'active', rejectReason: '', expiryDate },
      { new: true }
    ).populate('userId', SELLER_FIELDS);

    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
    res.json({ success: true, message: 'Ad approved', data: ad });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  PUT /api/ads/admin/:id/reject
// ════════════════════════════════════════════════════════════
router.put('/admin/:id/reject', async (req, res) => {
  try {
    const ad = await Ad.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected', rejectReason: req.body.reason || 'Does not meet guidelines.' },
      { new: true }
    );
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
    res.json({ success: true, message: 'Ad rejected', data: ad });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  GET /api/ads/:id — Single ad detail
//  ✅ Seller populate ke saath
// ════════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  try {
    const ad = await Ad
      .findByIdAndUpdate(
        req.params.id,
        { $inc: { views: 1 } },
        { new: true }
      )
      .populate('userId', SELLER_FIELDS);   // ✅ Seller info

    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
    res.json({ success: true, data: ad });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  PUT /api/ads/:id — Ad edit (sirf owner)
// ════════════════════════════════════════════════════════════
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const ad = await Ad.findOne({ _id: req.params.id, userId: req.userId });
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found or not authorized' });

    const allowed = ['brand','model','variant','condition','price','description','location','phone','images'];
    allowed.forEach(field => {
      if (req.body[field] !== undefined) ad[field] = req.body[field];
    });

    if (ad.status === 'rejected') {
      ad.status = 'pending';
      ad.rejectReason = '';
    }

    await ad.save();
    const populated = await ad.populate('userId', SELLER_FIELDS);
    res.json({ success: true, message: 'Ad updated', data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  DELETE /api/ads/:id
// ════════════════════════════════════════════════════════════
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const ad = await Ad.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
    res.json({ success: true, message: 'Ad deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  PUT /api/ads/:id/call — Call count
// ════════════════════════════════════════════════════════════
router.put('/:id/call', async (req, res) => {
  try {
    await Ad.findByIdAndUpdate(req.params.id, { $inc: { calls: 1 } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  PUT /api/ads/:id/report — Ad report karo
//  ✅ YEH NAI ENDPOINT HAI
// ════════════════════════════════════════════════════════════
router.put('/:id/report', async (req, res) => {
  try {
    await Ad.findByIdAndUpdate(req.params.id, { $inc: { reports: 1 } });
    res.json({ success: true, message: 'Ad reported. We will review it.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;