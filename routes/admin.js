const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Service = require('../models/Service');

const JWT_SECRET = process.env.JWT_SECRET || 'ahmed-cooling-secret-key-2024-secure-token';

// Admin Login Endpoint (Public, before adminAuth)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = (email || '').toLowerCase().trim();
    const cleanPass = (password || '').trim();

    // 1. Check against MongoDB User collection
    try {
      const dbAdmin = await User.findOne({ email: cleanEmail, role: 'admin' });
      if (dbAdmin) {
        const isMatch = await dbAdmin.comparePassword(cleanPass);
        if (isMatch) {
          const token = jwt.sign(
            { id: dbAdmin._id, email: dbAdmin.email, role: 'admin' },
            JWT_SECRET,
            { expiresIn: '30d' }
          );
          return res.json({
            success: true,
            token,
            user: {
              id: dbAdmin._id,
              fullName: dbAdmin.fullName || 'Ahmed Admin',
              email: dbAdmin.email,
              role: 'admin',
              isVerified: true
            }
          });
        }
      }
    } catch (dbErr) {
      console.warn('DB lookup error during admin login:', dbErr?.message);
    }

    // 2. Direct check for updated credentials
    if (
      cleanEmail === 'ahmad9038@legend.com' &&
      cleanPass === 'Ahmad389104@'
    ) {
      const token = jwt.sign(
        { id: 'usr_admin', email: 'ahmad9038@legend.com', role: 'admin' },
        JWT_SECRET,
        { expiresIn: '30d' }
      );
      return res.json({
        success: true,
        token,
        user: {
          id: 'usr_admin',
          fullName: 'Ahmed Admin',
          email: 'ahmad9038@legend.com',
          role: 'admin',
          isVerified: true
        }
      });
    }

    return res.status(401).json({ success: false, message: 'Invalid admin email or password' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
});

const adminAuth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, message: 'No token' });
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
    req.user = decoded;
    next();
  } catch { res.status(401).json({ success: false, message: 'Invalid token' }); }
};

router.use(adminAuth);

router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalBookings = await Booking.countDocuments();
    const pending = await Booking.countDocuments({ status: 'pending' });
    const confirmed = await Booking.countDocuments({ status: 'confirmed' });
    const completed = await Booking.countDocuments({ status: 'completed' });
    const cancelled = await Booking.countDocuments({ status: 'cancelled' });
    const inProgress = await Booking.countDocuments({ status: 'in_progress' });
    const totalServices = await Service.countDocuments({ active: true });

    const revenueResult = await Booking.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const revenue = revenueResult[0]?.total || 0;

    res.json({
      success: true,
      stats: { totalUsers, totalBookings, pending, confirmed, completed, cancelled, inProgress, totalServices, revenue },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/bookings', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status && status !== 'all') query.status = status;
    const skip = (page - 1) * limit;

    const bookings = await Booking.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    const total = await Booking.countDocuments(query);

    res.json({ success: true, bookings, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete Booking Endpoint
router.delete('/bookings/:id', async (req, res) => {
  try {
    const booking = await Booking.findByIdAndDelete(req.params.id);
    if (!booking) {
      // also try by bookingId or orderNumber
      await Booking.findOneAndDelete({ $or: [{ bookingId: req.params.id }, { orderNumber: req.params.id }] });
    }
    res.json({ success: true, message: 'Booking deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Clean up fake / test spam bookings from DB
router.post('/bookings/cleanup-fake', async (req, res) => {
  try {
    const result = await Booking.deleteMany({
      $or: [
        { customerName: { $regex: /fuck|asdasd|gfhf|dassa|ffsdfsd|asdad|afgfdcf|karanel|papa|mafia/i } },
        { address: { $regex: /depalpur|sorong|mountain view|dgdgd|sdasda|chuihiu/i } },
        { phone: '+923456494643' }
      ]
    });
    res.json({ success: true, message: 'Fake bookings deleted', deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    const users = await User.find({})
      .select('fullName email phone role isVerified isPhoneVerified createdAt authProvider')
      .sort({ createdAt: -1 });
    res.json({ success: true, users, total: users.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/users/:userId/bookings', async (req, res) => {
  try {
    const userData = await User.findById(req.params.userId).select('phone email');
    const conditions = [{ user: req.params.userId }];
    if (userData?.phone) conditions.push({ phone: userData.phone });
    if (userData?.email) conditions.push({ email: userData.email });

    const bookings = await Booking.find({ $or: conditions }).sort({ createdAt: -1 });
    res.json({ success: true, bookings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Reviews Management
router.get('/reviews', async (req, res) => {
  try {
    const bookings = await Booking.find({ 'customerFeedback.rating': { $exists: true, $gte: 1 } })
      .select('customerName customerFeedback createdAt address bookingId service serviceDetails')
      .sort({ 'customerFeedback.date': -1 });
    const reviews = bookings.map((b) => ({
      _id: b._id,
      bookingId: b.bookingId,
      customerName: b.customerName || 'Customer',
      serviceName: b.serviceDetails?.name || b.service?.name || 'Service',
      rating: b.customerFeedback?.rating || 5,
      comment: b.customerFeedback?.comment || '',
      date: b.customerFeedback?.date || b.createdAt,
      approved: b.customerFeedback?.approved || false,
    }));
    res.json({ success: true, reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/reviews/:id/approve', async (req, res) => {
  try {
    const { approved } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking || !booking.customerFeedback?.rating) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    booking.customerFeedback.approved = approved !== false;
    await booking.save();
    res.json({ success: true, message: approved !== false ? 'Review approved' : 'Review rejected' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Services Management
router.put('/services/:id', async (req, res) => {
  try {
    const Service = require('../models/Service');
    const service = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    res.json({ success: true, message: 'Service updated successfully', service });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/services', async (req, res) => {
  try {
    const Service = require('../models/Service');
    const service = await Service.create(req.body);
    res.json({ success: true, message: 'Service created successfully', service });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

