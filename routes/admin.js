const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Service = require('../models/Service');

const JWT_SECRET = process.env.JWT_SECRET || 'ahmed-cooling-secret-key-2024-secure-token';

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

module.exports = router;
