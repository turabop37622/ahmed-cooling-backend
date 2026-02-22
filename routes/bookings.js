const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const User = require('../models/User');
const Technician = require('../models/Technician');
const Notification = require('../models/Notification');
const { body, validationResult } = require('express-validator');
const axios = require('axios');

const JWT_SECRET = process.env.JWT_SECRET || 'ahmed-cooling-secret-key-2024-secure-token';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'turabop37622@gmail.com';
const BACKEND_URL = process.env.BACKEND_URL || 'https://ahmed-cooling-backend.onrender.com';

const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

const validateInternationalPhone = (phone) => {
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  if (!cleanPhone.startsWith('+')) return false;
  if (cleanPhone.length < 8 || cleanPhone.length > 16) return false;
  return /^\+[1-9]\d{6,14}$/.test(cleanPhone);
};

const phoneValidator = (value) => {
  if (!validateInternationalPhone(value)) throw new Error('Please enter a valid international phone number');
  return true;
};

// ============================================
// EMAIL: USER - Booking Received
// ============================================
const sendBookingReceivedEmail = async (toEmail, data) => {
  try {
    if (!toEmail) return;
    const { bookingId, orderNumber, customerName, serviceName, serviceIcon, date, time, address, servicePrice, visitCharges, totalAmount } = data;
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: "Ahmed Cooling Workshop", email: "turabop37622@gmail.com" },
      to: [{ email: toEmail }],
      subject: `Booking Received - ${bookingId} | Ahmed Cooling`,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;"><h2>Booking Received!</h2><p>Dear ${customerName}, your booking ${bookingId} has been received. Date: ${date}, Time: ${time}. Total: Rs. ${totalAmount}</p></div>`
    }, { headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' } });
    console.log('User received email sent');
  } catch (err) { console.error('User email failed:', err.message); }
};

// ============================================
// EMAIL: USER - Booking Confirmed
// ============================================
const sendBookingConfirmedEmail = async (toEmail, data) => {
  try {
    if (!toEmail) return;
    const { bookingId, customerName, serviceName, serviceIcon, date, time, address, totalAmount } = data;
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: "Ahmed Cooling Workshop", email: "turabop37622@gmail.com" },
      to: [{ email: toEmail }],
      subject: `Booking CONFIRMED - ${bookingId} | Ahmed Cooling`,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;"><h2>Booking Confirmed!</h2><p>Dear ${customerName}, your booking ${bookingId} has been confirmed. Date: ${date}, Time: ${time}. Total: Rs. ${totalAmount}</p></div>`
    }, { headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' } });
    console.log('User confirmed email sent');
  } catch (err) { console.error('Confirmed email failed:', err.message); }
};

// ============================================
// EMAIL: CUSTOMER - Booking Cancelled
// ============================================
const sendCustomerCancellationEmail = async (toEmail, data) => {
  try {
    if (!toEmail) return;
    const { bookingId, customerName, serviceName, serviceIcon, date, time, cancellationReason } = data;
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: "Ahmed Cooling Workshop", email: "turabop37622@gmail.com" },
      to: [{ email: toEmail }],
      subject: `Booking Cancelled - ${bookingId} | Ahmed Cooling`,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;"><h2>Booking Cancelled</h2><p>Dear ${customerName}, your booking ${bookingId} has been cancelled. Reason: ${cancellationReason || 'N/A'}</p></div>`
    }, { headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' } });
    console.log('Customer cancellation email sent to:', toEmail);
  } catch (err) { console.error('Customer cancel email failed:', err.message); }
};

// ============================================
// EMAIL: ADMIN - Booking Cancellation Alert
// ============================================
const sendBookingCancellationEmail = async (data) => {
  try {
    const { bookingId, customerName, customerPhone, serviceName, date, time, cancellationReason } = data;
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: "Ahmed Cooling - System", email: "turabop37622@gmail.com" },
      to: [{ email: ADMIN_EMAIL }],
      subject: `Booking CANCELLED: ${bookingId} | ${customerName}`,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;"><h2>Booking Cancelled!</h2><p>Customer: ${customerName}, Phone: ${customerPhone}. Booking: ${bookingId}. Date: ${date}, Time: ${time}. Reason: ${cancellationReason || 'N/A'}</p></div>`
    }, { headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' } });
    console.log('Cancellation email sent to admin');
  } catch (err) { console.error('Cancellation email failed:', err.message); }
};

// ============================================
// NEW: EMAIL: USER - Service Completed
// ============================================
const sendBookingCompletedEmailToUser = async (toEmail, data) => {
  try {
    if (!toEmail) return;
    const { bookingId, customerName, serviceName, serviceIcon, date, time, totalAmount } = data;
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: "Ahmed Cooling Workshop", email: "turabop37622@gmail.com" },
      to: [{ email: toEmail }],
      subject: `Service Completed - ${bookingId} | Ahmed Cooling`,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
          <div style="background:linear-gradient(135deg,#10B981,#059669);padding:32px 24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:26px;">Ahmed Cooling Workshop</h1>
            <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;">Service Completed Successfully!</p>
          </div>
          <div style="background:#ECFDF5;padding:14px 24px;text-align:center;border-bottom:2px solid #A7F3D0;">
            <p style="color:#065F46;font-size:20px;font-weight:bold;margin:0;">Your Service is Complete!</p>
            <p style="color:#047857;margin:4px 0 0;font-size:13px;">Thank you for choosing Ahmed Cooling Workshop</p>
          </div>
          <div style="background:#fff;padding:28px 24px;">
            <p style="color:#374151;font-size:15px;">Dear <strong>${customerName}</strong>, your service has been completed successfully!</p>
            <div style="background:#F0FDF4;border-left:4px solid #10B981;border-radius:8px;padding:14px 18px;margin:16px 0;">
              <p style="margin:0;font-size:13px;color:#6B7280;">Booking ID</p>
              <p style="margin:4px 0 0;font-size:22px;font-weight:bold;color:#059669;">${bookingId}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
              <tr style="background:#F9FAFB;"><td style="padding:11px 14px;font-size:13px;color:#6B7280;width:40%;">Service</td><td style="padding:11px 14px;font-size:14px;font-weight:600;">${serviceIcon || ''} ${serviceName}</td></tr>
              <tr><td style="padding:11px 14px;font-size:13px;color:#6B7280;">Date</td><td style="padding:11px 14px;font-size:14px;font-weight:600;">${date}</td></tr>
              <tr style="background:#F9FAFB;"><td style="padding:11px 14px;font-size:13px;color:#6B7280;">Time</td><td style="padding:11px 14px;font-size:14px;font-weight:600;">${time}</td></tr>
              <tr><td style="padding:11px 14px;font-size:13px;color:#6B7280;">Amount Paid</td><td style="padding:11px 14px;font-size:16px;font-weight:bold;color:#059669;">Rs. ${totalAmount}</td></tr>
            </table>
            <div style="background:#FEF3C7;border-radius:8px;padding:14px;text-align:center;margin-bottom:16px;">
              <p style="margin:0;color:#92400E;font-size:14px;font-weight:600;">How was our service?</p>
              <p style="margin:6px 0 0;font-size:13px;color:#B45309;">Please rate us on the app!</p>
            </div>
            <div style="background:#EFF6FF;border-radius:8px;padding:14px;text-align:center;">
              <p style="margin:0;font-size:13px;color:#1D4ED8;">Need AC service again? Book us anytime!</p>
              <p style="margin:4px 0 0;font-size:13px;color:#1D4ED8;">+92 300 1234567</p>
            </div>
          </div>
          <div style="background:#1F2937;padding:18px 24px;text-align:center;">
            <p style="color:#9CA3AF;font-size:12px;margin:0;">2025 Ahmed Cooling & Appliances Workshop</p>
          </div>
        </div>
      `
    }, { headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' } });
    console.log('Completion email sent to user:', toEmail);
  } catch (err) { console.error('User completion email failed:', err.message); }
};

// ============================================
// NEW: EMAIL: ADMIN - Service Completed Summary
// ============================================
const sendBookingCompletedEmailToAdmin = async (data) => {
  try {
    const { bookingId, orderNumber, customerName, customerPhone, serviceName, serviceIcon, date, time, totalAmount, technicianNotes } = data;
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: "Ahmed Cooling - System", email: "turabop37622@gmail.com" },
      to: [{ email: ADMIN_EMAIL }],
      subject: `Service Completed: ${bookingId} | ${customerName}`,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.15);">
          <div style="background:linear-gradient(135deg,#10B981,#059669);padding:24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:22px;">Service Completed!</h1>
            <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Ahmed Cooling Admin Panel</p>
          </div>
          <div style="background:#ECFDF5;padding:14px 24px;text-align:center;border-bottom:2px solid #A7F3D0;">
            <p style="color:#065F46;font-size:16px;font-weight:bold;margin:0;">Booking Successfully Completed</p>
            <p style="color:#047857;margin:4px 0 0;font-size:13px;">Booking ID: <strong>${bookingId}</strong></p>
          </div>
          <div style="background:#fff;padding:28px 24px;">
            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
              <tr style="background:#F9FAFB;"><td style="padding:10px 14px;font-size:13px;color:#6B7280;width:35%;">Customer</td><td style="padding:10px 14px;font-size:14px;font-weight:600;">${customerName}</td></tr>
              <tr><td style="padding:10px 14px;font-size:13px;color:#6B7280;">Phone</td><td style="padding:10px 14px;font-size:14px;font-weight:600;"><a href="tel:${customerPhone}" style="color:#3B82F6;">${customerPhone}</a></td></tr>
              <tr style="background:#F9FAFB;"><td style="padding:10px 14px;font-size:13px;color:#6B7280;">Service</td><td style="padding:10px 14px;font-size:14px;font-weight:600;">${serviceIcon || ''} ${serviceName}</td></tr>
              <tr><td style="padding:10px 14px;font-size:13px;color:#6B7280;">Date</td><td style="padding:10px 14px;font-size:14px;font-weight:600;">${date}</td></tr>
              <tr style="background:#F9FAFB;"><td style="padding:10px 14px;font-size:13px;color:#6B7280;">Time</td><td style="padding:10px 14px;font-size:14px;font-weight:600;">${time}</td></tr>
              <tr><td style="padding:10px 14px;font-size:13px;color:#6B7280;">Order #</td><td style="padding:10px 14px;font-size:14px;font-weight:600;">${orderNumber || 'N/A'}</td></tr>
              <tr style="background:#F9FAFB;"><td style="padding:10px 14px;font-size:13px;color:#6B7280;">Total</td><td style="padding:10px 14px;font-size:16px;font-weight:bold;color:#059669;">Rs. ${totalAmount}</td></tr>
            </table>
            ${technicianNotes ? '<div style="background:#F0FDF4;border-radius:10px;padding:14px;margin-bottom:16px;border-left:4px solid #10B981;"><p style="color:#065F46;font-size:13px;font-weight:600;margin:0 0 6px;">Technician Notes:</p><p style="color:#047857;font-size:13px;margin:0;">' + technicianNotes + '</p></div>' : ''}
            <div style="background:#EFF6FF;border-radius:8px;padding:12px;text-align:center;">
              <p style="margin:0;font-size:13px;color:#1D4ED8;font-weight:600;">Payment: Cash collected at site</p>
            </div>
          </div>
          <div style="background:#1F2937;padding:18px 24px;text-align:center;">
            <p style="color:#9CA3AF;font-size:12px;margin:0;">2025 Ahmed Cooling Admin System</p>
          </div>
        </div>
      `
    }, { headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' } });
    console.log('Completion summary email sent to admin');
  } catch (err) { console.error('Admin completion email failed:', err.message); }
};

// ============================================
// EMAIL: ADMIN - New Booking with Confirm/Cancel Buttons
// ============================================
const sendAdminNotificationEmail = async (data) => {
  try {
    const { bookingId, orderNumber, customerName, customerEmail, customerPhone, serviceName, serviceIcon, date, time, address, comments, servicePrice, visitCharges, totalAmount } = data;
    const actionToken = jwt.sign({ bookingId, action: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    const confirmUrl = `${BACKEND_URL}/api/bookings/admin/confirm/${bookingId}?token=${actionToken}`;
    const cancelUrl  = `${BACKEND_URL}/api/bookings/admin/cancel/${bookingId}?token=${actionToken}`;
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: "Ahmed Cooling - System", email: "turabop37622@gmail.com" },
      to: [{ email: ADMIN_EMAIL }],
      subject: `New Booking: ${bookingId} | ${customerName} | ${serviceName}`,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;"><h2>New Booking: ${bookingId}</h2><p>Customer: ${customerName}, Phone: ${customerPhone}, Email: ${customerEmail || 'N/A'}</p><p>Service: ${serviceName}, Date: ${date}, Time: ${time}</p><p>Address: ${address}</p><p>Total: Rs. ${totalAmount}</p><br/><a href="${confirmUrl}" style="background:#10B981;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin-right:12px;">Confirm Booking</a>&nbsp;&nbsp;<a href="${cancelUrl}" style="background:#EF4444;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">Cancel Booking</a></div>`
    }, { headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' } });
    console.log('Admin notification email sent');
  } catch (err) { console.error('Admin email failed:', err.message); }
};

// ADMIN CONFIRM BOOKING
router.get('/admin/confirm/:bookingId', async (req, res) => {
  try {
    const { token } = req.query;
    const { bookingId } = req.params;
    try { jwt.verify(token, JWT_SECRET); } catch (e) {
      return res.send(adminPage('Link Expired!', '#EF4444', '#FEF2F2', 'This link has expired.'));
    }
    const booking = await Booking.findOne({ bookingId });
    if (!booking) return res.send(adminPage('Not Found', '#EF4444', '#FEF2F2', `Booking ${bookingId} not found.`));
    if (booking.status === 'confirmed') return res.send(adminPage('Already Confirmed!', '#10B981', '#F0FDF4', `Customer: ${booking.customerName}`));
    if (booking.status === 'cancelled') return res.send(adminPage('Already Cancelled', '#F59E0B', '#FFFBEB', 'This booking was already cancelled.'));
    booking.status = 'confirmed';
    booking.statusHistory.push({ status: 'confirmed', timestamp: new Date(), note: 'Confirmed by admin via email link' });
    await booking.save();
    const serviceData = typeof booking.service === 'object' ? booking.service : {};
    if (booking.email) {
      sendBookingConfirmedEmail(booking.email, {
        bookingId: booking.bookingId, orderNumber: booking.orderNumber,
        customerName: booking.customerName,
        serviceName: serviceData.name || 'AC Service', serviceIcon: serviceData.icon || '',
        date: booking.date, time: booking.time, address: booking.address, totalAmount: booking.totalAmount,
      });
    }
    return res.send(adminPage('Booking Confirmed!', '#059669', '#F0FDF4',
      `Booking <strong>${bookingId}</strong> confirmed!<br><br>Customer: ${booking.customerName}<br>Phone: ${booking.phone}<br>Date: ${booking.date} | Time: ${booking.time}<br><br>Customer ko email bhej di gayi.`));
  } catch (error) {
    return res.send(adminPage('Server Error', '#EF4444', '#FEF2F2', error.message));
  }
});

// ADMIN CANCEL BOOKING
router.get('/admin/cancel/:bookingId', async (req, res) => {
  try {
    const { token } = req.query;
    const { bookingId } = req.params;
    try { jwt.verify(token, JWT_SECRET); } catch (e) {
      return res.send(adminPage('Link Expired!', '#EF4444', '#FEF2F2', 'This link has expired.'));
    }
    const booking = await Booking.findOne({ bookingId });
    if (!booking) return res.send(adminPage('Not Found', '#EF4444', '#FEF2F2', `Booking ${bookingId} not found.`));
    if (['cancelled', 'completed'].includes(booking.status)) {
      return res.send(adminPage('Cannot Cancel', '#F59E0B', '#FFFBEB', `Booking already ${booking.status}.`));
    }
    booking.status = 'cancelled';
    booking.cancellationReason = 'Cancelled by admin via email';
    booking.cancelledAt = new Date();
    booking.statusHistory.push({ status: 'cancelled', timestamp: new Date(), note: 'Cancelled by admin via email link' });
    await booking.save();
    return res.send(adminPage('Booking Cancelled', '#DC2626', '#FEF2F2',
      `Booking <strong>${bookingId}</strong> cancelled.<br><br>Customer: ${booking.customerName}<br>Phone: ${booking.phone}`));
  } catch (error) {
    return res.send(adminPage('Server Error', '#EF4444', '#FEF2F2', error.message));
  }
});

const adminPage = (title, color, bg, message) => `
  <html><body style="font-family:Arial,sans-serif;text-align:center;padding:60px;background:${bg};">
    <div style="max-width:500px;margin:auto;background:white;border-radius:16px;padding:40px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
      <h2 style="color:${color};margin-bottom:16px;">${title}</h2>
      <p style="color:#374151;font-size:15px;line-height:1.6;">${message}</p>
      <p style="color:#9CA3AF;font-size:12px;margin-top:24px;">Ahmed Cooling Admin System</p>
    </div>
  </body></html>
`;

router.use((req, res, next) => {
  console.log(`Booking Route: ${req.method} ${req.baseUrl}${req.path}`);
  next();
});

// PUBLIC ROUTES

router.put('/public/cancel/:bookingId', async (req, res) => {
  try {
    const { reason, phone } = req.body;
    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (phone && booking.phone !== phone) return res.status(403).json({ success: false, message: 'Phone does not match' });
    if (!['pending', 'confirmed'].includes(booking.status)) return res.status(400).json({ success: false, message: `Cannot cancel in ${booking.status} status` });
    booking.status = 'cancelled';
    booking.cancellationReason = reason || 'Cancelled by customer';
    booking.cancelledAt = new Date();
    booking.statusHistory.push({ status: 'cancelled', timestamp: new Date(), note: 'Cancelled by customer' });
    await booking.save();
    const serviceData = typeof booking.service === 'object' ? booking.service : {};
    const emailPayload = {
      bookingId: booking.bookingId, orderNumber: booking.orderNumber,
      customerName: booking.customerName, customerPhone: booking.phone,
      serviceName: serviceData.name || serviceData.titleKey || 'AC Service',
      serviceIcon: serviceData.icon || '', date: booking.date, time: booking.time,
      cancellationReason: reason || 'Cancelled by customer',
    };
    sendBookingCancellationEmail(emailPayload);
    if (booking.email) sendCustomerCancellationEmail(booking.email, { ...emailPayload, customerName: booking.customerName });
    res.json({ success: true, message: 'Booking cancelled', data: { bookingId: booking.bookingId, status: booking.status } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

router.post('/public', [
  body('customerName').trim().notEmpty().withMessage('Name required').isLength({ min: 2 }),
  body('phone').trim().notEmpty().withMessage('Phone required').custom(phoneValidator),
  body('email').optional({ checkFalsy: true }).trim().isEmail(),
  body('service').notEmpty().withMessage('Service required'),
  body('date').notEmpty().withMessage('Date required'),
  body('time').notEmpty().withMessage('Time required'),
  body('address').trim().notEmpty().withMessage('Address required'),
  body('comments').optional().trim(),
  body('userId').optional({ checkFalsy: true }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array(), message: errors.array()[0].msg });
    const { customerName, phone, email, service, date, time, address, comments, coordinates, placeId, platform, language, userId, userEmail, userName } = req.body;
    let validUserId = null;
    if (userId) {
      try { const u = await User.findById(userId); if (u) validUserId = u._id; } catch (err) {}
    }
    const bookingId   = `BK${Date.now()}`;
    const orderNumber = `ORD-${new Date().toISOString().split('T')[0].replace(/-/g,'')}-${Math.floor(Math.random()*10000)}`;
    const servicePrice  = service.basePrice || 0;
    const visitCharges  = 200;
    const totalAmount   = servicePrice + visitCharges;
    const finalEmail    = email || userEmail || '';
    const booking = await Booking.create({
      bookingId, orderNumber, user: validUserId || undefined,
      customerName: customerName.trim(), phone: phone.trim(), email: finalEmail,
      service, date, time, address: address.trim(), comments: comments?.trim() || '',
      coordinates: coordinates || { latitude: 0, longitude: 0 },
      placeId: placeId || '', platform: platform || 'android', language: language || 'en',
      status: 'pending', servicePrice, visitCharges, totalAmount,
      statusHistory: [{ status: 'pending', timestamp: new Date(), note: validUserId ? `User: ${userName || customerName}` : 'Guest booking' }],
    });
    const emailData = {
      bookingId, orderNumber, customerName: customerName.trim(), customerEmail: finalEmail,
      customerPhone: phone.trim(), serviceName: service.name || service.titleKey || 'AC Service',
      serviceIcon: service.icon || '', date, time, address: address.trim(),
      comments: comments || '', servicePrice, visitCharges, totalAmount,
    };
    if (finalEmail) sendBookingReceivedEmail(finalEmail, emailData);
    sendAdminNotificationEmail(emailData);
    res.status(201).json({ success: true, message: 'Booking created successfully', data: { booking, bookingId: booking.bookingId, isLinkedToUser: !!validUserId } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create booking', error: error.message });
  }
});

router.get('/public/:bookingId', async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, data: { booking } });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error', error: error.message }); }
});

router.get('/phone/:phone', async (req, res) => {
  try {
    const bookings = await Booking.find({ phone: req.params.phone }).sort({ createdAt: -1 });
    res.json({ success: true, data: { bookings } });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error', error: error.message }); }
});

// AUTH ROUTES

router.get('/user/my-bookings', auth, async (req, res) => {
  try {
    const { status, limit = 10, page = 1 } = req.query;
    const query = { user: req.user.userId };
    if (status) query.status = status;
    const skip = (page - 1) * limit;
    const bookings = await Booking.find(query)
      .populate('service', 'name nameAr icon basePrice category')
      .populate('technician', 'name phone')
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await Booking.countDocuments(query);
    res.json({ success: true, bookings, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total/limit) } });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error', error: error.message }); }
});

router.post('/', auth, [
  body('serviceId').notEmpty(), body('scheduledDate').notEmpty(),
  body('scheduledTime').notEmpty(), body('address').notEmpty(),
  body('phone').trim().notEmpty().custom(phoneValidator),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array(), message: errors.array()[0].msg });
    const { serviceId, scheduledDate, scheduledTime, address, phone, problemDescription, priority = 'normal', images = [], technicianId } = req.body;
    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const booking = new Booking({ user: req.user.userId, service: serviceId, scheduledDate, scheduledTime, address, phone: phone.trim(), problemDescription, priority, images, estimatedCost: service.basePrice, status: 'pending' });
    if (technicianId) {
      const tech = await Technician.findOne({ user: technicianId });
      if (tech && tech.availability) { booking.technician = technicianId; booking.status = 'assigned'; }
    }
    await booking.save();
    await booking.populate('service', 'name nameAr icon basePrice');
    await new Notification({ user: req.user.userId, type: 'booking', title: 'Booking Received', message: `Your booking for ${service.name} received. Order #${booking.orderNumber}`, data: { bookingId: booking._id, orderNumber: booking.orderNumber } }).save();
    sendAdminNotificationEmail({ bookingId: booking.bookingId||booking._id.toString(), orderNumber: booking.orderNumber, customerName: user.name||user.fullName, customerEmail: user.email, customerPhone: phone, serviceName: service.name, serviceIcon: service.icon||'', date: scheduledDate, time: scheduledTime, address, servicePrice: service.basePrice, visitCharges: 200, totalAmount: service.basePrice+200 });
    res.status(201).json({ success: true, message: 'Booking created', booking });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error', error: error.message }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('service').populate('technician', 'name phone rating').populate('user', 'name email phone');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.user && booking.user._id.toString() !== req.user.userId && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Access denied' });
    res.json({ success: true, booking });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error', error: error.message }); }
});

router.put('/:id/cancel', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.user && booking.user.toString() !== req.user.userId && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Access denied' });
    if (!['pending', 'confirmed'].includes(booking.status)) return res.status(400).json({ success: false, message: `Cannot cancel in ${booking.status} status` });
    booking.status = 'cancelled';
    booking.cancellationReason = reason || 'Cancelled by customer';
    booking.cancelledAt = new Date();
    booking.statusHistory.push({ status: 'cancelled', timestamp: new Date(), note: 'Cancelled by customer' });
    await booking.save();
    const serviceData = typeof booking.service === 'object' ? booking.service : {};
    const emailPayload = {
      bookingId: booking.bookingId||booking._id.toString(), orderNumber: booking.orderNumber,
      customerName: booking.customerName, customerPhone: booking.phone,
      serviceName: serviceData.name||serviceData.titleKey||'AC Service',
      serviceIcon: serviceData.icon||'', date: booking.date, time: booking.time, cancellationReason: reason,
    };
    sendBookingCancellationEmail(emailPayload);
    if (booking.email) sendCustomerCancellationEmail(booking.email, { ...emailPayload, customerName: booking.customerName });
    if (booking.user) await new Notification({ user: booking.user, type: 'booking', title: 'Booking Cancelled', message: `Your booking #${booking.orderNumber} has been cancelled.`, data: { bookingId: booking._id } }).save();
    res.json({ success: true, message: 'Booking cancelled', booking });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error', error: error.message }); }
});

// ============================================
// STATUS UPDATE - NOW WITH COMPLETION EMAILS
// ============================================
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (req.user.role !== 'admin' && req.user.role !== 'technician') return res.status(403).json({ success: false, message: 'Access denied' });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const validTransitions = {
      pending:     ['confirmed', 'completed', 'cancelled'],
      confirmed:   ['assigned', 'in_progress', 'completed', 'cancelled'],
      assigned:    ['on_the_way', 'in_progress', 'completed', 'cancelled'],
      on_the_way:  ['in_progress', 'completed', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
    };
    if (!validTransitions[booking.status]?.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid transition: ${booking.status} -> ${status}` });
    }

    booking.status = status;
    if (notes) booking.technicianNotes = notes;
    if (req.user.role === 'technician' && !booking.technician) booking.technician = req.user.userId;
    if (status === 'completed') booking.completedAt = new Date();
    booking.statusHistory.push({ status, timestamp: new Date(), note: notes || `Status changed to ${status}` });
    await booking.save();

    // NEW: COMPLETION EMAILS - User aur Admin dono ko
    if (status === 'completed') {
      const serviceData = typeof booking.service === 'object' ? booking.service : {};
      let userEmail = booking.email || '';

      // Agar email nahi hai to User model se lo
      if (!userEmail && booking.user) {
        try {
          const userDoc = await User.findById(booking.user).select('email');
          if (userDoc && userDoc.email) userEmail = userDoc.email;
        } catch (e) {}
      }

      const emailData = {
        bookingId: booking.bookingId || booking._id.toString(),
        orderNumber: booking.orderNumber || '',
        customerName: booking.customerName || '',
        customerPhone: booking.phone || '',
        serviceName: serviceData.name || serviceData.titleKey || 'AC Service',
        serviceIcon: serviceData.icon || '',
        date: booking.date || booking.scheduledDate || '',
        time: booking.time || booking.scheduledTime || '',
        totalAmount: booking.totalAmount || 0,
        technicianNotes: notes || '',
      };

      // User ko completion email
      if (userEmail) sendBookingCompletedEmailToUser(userEmail, emailData);

      // Admin ko completion summary
      sendBookingCompletedEmailToAdmin(emailData);

      console.log('Completion emails triggered. User email:', userEmail || 'N/A - no email saved');
    }

    if (booking.user) {
      await new Notification({
        user: booking.user, type: 'booking',
        title: status === 'completed' ? 'Service Completed!' : `Booking ${status}`,
        message: status === 'completed'
          ? `Your booking #${booking.orderNumber} has been completed. Thank you!`
          : `Your booking #${booking.orderNumber} is now ${status}.`,
        data: { bookingId: booking._id, status }
      }).save();
    }

    res.json({ success: true, message: `Status updated to ${status}`, booking });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

router.post('/:id/feedback', auth, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.user.toString() !== req.user.userId) return res.status(403).json({ success: false, message: 'Access denied' });
    if (booking.status !== 'completed') return res.status(400).json({ success: false, message: 'Only for completed bookings' });
    if (booking.customerFeedback) return res.status(400).json({ success: false, message: 'Already submitted' });
    booking.customerFeedback = { rating, comment, date: new Date() };
    await booking.save();
    if (booking.technician) {
      const tech = await Technician.findOne({ user: booking.technician });
      if (tech) { const n=tech.totalRatings+1; tech.rating=parseFloat(((tech.rating*tech.totalRatings+rating)/n).toFixed(1)); tech.totalRatings=n; tech.completedJobs+=1; await tech.save(); }
    }
    res.json({ success: true, message: 'Feedback submitted', booking });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error', error: error.message }); }
});

router.get('/:id/track', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.user.toString() !== req.user.userId && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Access denied' });
    let location = null;
    if (booking.technician) {
      const tech = await Technician.findOne({ user: booking.technician });
      if (tech?.currentLocation) location = { coordinates: tech.currentLocation.coordinates, lastUpdated: tech.currentLocation.lastUpdated };
    }
    res.json({ success: true, location, status: booking.status, estimatedArrival: booking.status === 'on_the_way' ? '15-20 minutes' : null });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error', error: error.message }); }
});

module.exports = router;