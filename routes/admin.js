const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const Inquiry = require('../models/Inquiry');
const GeneralRating = require('../models/GeneralRating');
const auth = require('../middleware/auth');
const { normEmail, burnPasswordCheck } = require('../utils/security');

const isObjectId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);
// Page/limit from the query string: default 50, hard cap 100.
const pageParams = (req) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  return { page, limit, skip: (page - 1) * limit };
};
const pageInfo = (total, page, limit) => ({ total, page, limit, pages: Math.ceil(total / limit) });
const serverError = (res) => res.status(500).json({ success: false, message: 'Server error' });

const JWT_SECRET = process.env.JWT_SECRET;

// Admin Login Endpoint (Public, before adminAuth)
router.post('/login', async (req, res) => {
  try {
    const cleanEmail = normEmail(req.body.email);
    const cleanPass = typeof req.body.password === 'string' ? req.body.password : '';
    if (!cleanEmail || !cleanPass) return res.status(400).json({ success: false, message: 'Email and password are required' });

    // 1. Check against MongoDB User collection
    try {
      const dbAdmin = await User.findOne({ email: cleanEmail, role: 'admin' });
      if (!dbAdmin) await burnPasswordCheck(cleanPass);
      if (dbAdmin) {
        const isMatch = await dbAdmin.comparePassword(cleanPass);
        if (isMatch) {
          const token = jwt.sign(
            { id: dbAdmin._id, email: dbAdmin.email, role: 'admin' },
            JWT_SECRET,
            { algorithm: 'HS256', expiresIn: '8h' }
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

router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 72) {
      return res.status(400).json({ success: false, message: 'Use a new password of 12 to 72 characters' });
    }
    const user = await User.findById(req.user.id);
    if (!user || !(await user.comparePassword(currentPassword))) return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password changed' });
  } catch {
    res.status(500).json({ success: false, message: 'Could not change password' });
  }
});

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
    serverError(res);
  }
});

router.get('/bookings', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const query = {};
    if (typeof req.query.status === 'string' && req.query.status !== 'all') query.status = req.query.status;

    const bookings = await Booking.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    const total = await Booking.countDocuments(query);

    res.json({ success: true, bookings, pagination: { total, page, pages: Math.ceil(total / limit) } });
  } catch (err) {
    serverError(res);
  }
});

// Delete Booking Endpoint
router.delete('/bookings/:id', async (req, res) => {
  try {
    const key = String(req.params.id);
    const filter = isObjectId(key) ? { _id: key } : { $or: [{ bookingId: key }, { orderNumber: key }] };
    const booking = await Booking.findOneAndDelete(filter);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    // Audit trail: who deleted what (kept in the server log so a deletion can always be traced).
    console.warn(`🗑️ AUDIT booking deleted by admin ${req.user.id}: ${booking.bookingId || booking._id} (${booking.status}, ${booking.totalAmount || 0} ${booking.currency || ''})`);
    res.json({ success: true, message: 'Booking deleted successfully' });
  } catch (err) {
    serverError(res);
  }
});

router.get('/users', async (req, res) => {
  try {
    const { page, limit, skip } = pageParams(req);
    const [users, total] = await Promise.all([
      User.find({})
        .select('fullName email phone role isVerified isPhoneVerified createdAt authProvider')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments({}),
    ]);
    res.json({ success: true, users, total, pagination: pageInfo(total, page, limit) });
  } catch (err) {
    serverError(res);
  }
});

router.get('/inquiries', async (req, res) => {
  try {
    const inquiries = await Inquiry.find().sort({ createdAt: -1 }).limit(200);
    res.json({ success: true, inquiries });
  } catch {
    res.status(500).json({ success: false, message: 'Could not load inquiries' });
  }
});

router.get('/ratings', async (req, res) => {
  try {
    const ratings = await GeneralRating.find().sort({ createdAt: -1 }).limit(200);
    res.json({ success: true, ratings });
  } catch {
    res.status(500).json({ success: false, message: 'Could not load ratings' });
  }
});

router.get('/users/:userId/bookings', async (req, res) => {
  try {
    if (!isObjectId(req.params.userId)) return res.status(404).json({ success: false, message: 'User not found' });
    const userData = await User.findById(req.params.userId).select('phone email');
    const conditions = [{ user: req.params.userId }];
    if (userData?.phone) conditions.push({ phone: userData.phone });
    if (userData?.email) conditions.push({ email: userData.email });

    const { page, limit, skip } = pageParams(req);
    const filter = { $or: conditions };
    const [bookings, total] = await Promise.all([
      Booking.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Booking.countDocuments(filter),
    ]);
    res.json({ success: true, bookings, total, pagination: pageInfo(total, page, limit) });
  } catch (err) {
    serverError(res);
  }
});

// Reviews Management
router.get('/reviews', async (req, res) => {
  try {
    const { page, limit, skip } = pageParams(req);
    const reviewFilter = { 'customerFeedback.rating': { $exists: true, $gte: 1 } };
    const total = await Booking.countDocuments(reviewFilter);
    const bookings = await Booking.find(reviewFilter)
      .select('customerName customerFeedback createdAt address bookingId service serviceDetails')
      .sort({ 'customerFeedback.date': -1 })
      .skip(skip)
      .limit(limit);
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
    res.json({ success: true, reviews, total, pagination: pageInfo(total, page, limit) });
  } catch (err) {
    serverError(res);
  }
});

router.put('/reviews/:id/approve', async (req, res) => {
  try {
    const { approved } = req.body;
    if (!isObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Review not found' });
    const booking = await Booking.findById(req.params.id);
    if (!booking || !booking.customerFeedback?.rating) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    booking.customerFeedback.approved = approved !== false;
    await booking.save();
    res.json({ success: true, message: approved !== false ? 'Review approved' : 'Review rejected' });
  } catch (err) {
    serverError(res);
  }
});

// Service management lives in routes/services.js (validated, admin only): /api/services

module.exports = router;

