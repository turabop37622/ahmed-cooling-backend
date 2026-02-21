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

// ============================================
// AUTH MIDDLEWARE
// ============================================
const JWT_SECRET = process.env.JWT_SECRET || 'ahmed-cooling-secret-key-2024-secure-token';

const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    console.log('✅ Auth middleware - User ID:', req.user.userId);
    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// ============================================
// PHONE VALIDATION
// ============================================
const validateInternationalPhone = (phone) => {
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  const internationalRegex = /^\+[1-9]\d{6,14}$/;
  if (!cleanPhone.startsWith('+')) return false;
  if (cleanPhone.length < 8 || cleanPhone.length > 16) return false;
  return internationalRegex.test(cleanPhone);
};

const phoneValidator = (value) => {
  if (!validateInternationalPhone(value)) {
    throw new Error('Please enter a valid international phone number (e.g., +923001234567)');
  }
  return true;
};

// ============================================
// ✅ BOOKING CONFIRMATION EMAIL FUNCTION
// ============================================
const sendBookingConfirmationEmail = async (toEmail, bookingData) => {
  try {
    if (!toEmail) {
      console.log('⚠️ No email provided, skipping email');
      return;
    }

    console.log('📧 Sending booking confirmation email to:', toEmail);

    const {
      bookingId,
      orderNumber,
      customerName,
      serviceName,
      serviceIcon,
      date,
      time,
      address,
      servicePrice,
      visitCharges,
      totalAmount,
    } = bookingData;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #3B82F6, #1D4ED8); padding: 32px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px;">❄️ Ahmed Cooling</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 15px;">Your booking is confirmed!</p>
        </div>

        <!-- Green Success Banner -->
        <div style="background: #ECFDF5; padding: 16px 24px; text-align: center; border-bottom: 2px solid #D1FAE5;">
          <p style="color: #065F46; font-size: 18px; font-weight: bold; margin: 0;">✅ Booking Confirmed!</p>
          <p style="color: #6EE7B7; margin: 4px 0 0; font-size: 13px;">We have received your booking request</p>
        </div>

        <!-- Body -->
        <div style="background: #ffffff; padding: 28px 24px;">

          <p style="color: #374151; font-size: 15px; margin: 0 0 20px;">
            Dear <strong>${customerName}</strong>, your booking has been successfully placed. Here are your booking details:
          </p>

          <!-- Booking ID Card -->
          <div style="background: #EFF6FF; border-left: 4px solid #3B82F6; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 13px; color: #6B7280;">Booking ID</p>
            <p style="margin: 4px 0 0; font-size: 20px; font-weight: bold; color: #1D4ED8; letter-spacing: 1px;">${bookingId}</p>
            <p style="margin: 4px 0 0; font-size: 12px; color: #9CA3AF;">Order: ${orderNumber}</p>
          </div>

          <!-- Service Details -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr style="background: #F9FAFB;">
              <td style="padding: 12px 16px; font-size: 13px; color: #6B7280; width: 40%;">🔧 Service</td>
              <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #111827;">${serviceIcon || '❄️'} ${serviceName}</td>
            </tr>
            <tr>
              <td style="padding: 12px 16px; font-size: 13px; color: #6B7280;">📅 Date</td>
              <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #111827;">${date}</td>
            </tr>
            <tr style="background: #F9FAFB;">
              <td style="padding: 12px 16px; font-size: 13px; color: #6B7280;">🕐 Time</td>
              <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #111827;">${time}</td>
            </tr>
            <tr>
              <td style="padding: 12px 16px; font-size: 13px; color: #6B7280;">📍 Address</td>
              <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #111827;">${address}</td>
            </tr>
          </table>

          <!-- Price Summary -->
          <div style="background: #F9FAFB; border-radius: 10px; padding: 18px; margin-bottom: 24px;">
            <p style="font-size: 14px; font-weight: bold; color: #374151; margin: 0 0 12px;">💰 Price Summary</p>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="font-size: 13px; color: #6B7280;">Service Charge</span>
              <span style="font-size: 13px; color: #374151;">Rs. ${servicePrice || 0}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
              <span style="font-size: 13px; color: #6B7280;">Visit Fee</span>
              <span style="font-size: 13px; color: #374151;">Rs. ${visitCharges || 200}</span>
            </div>
            <div style="border-top: 1px solid #E5E7EB; padding-top: 12px; display: flex; justify-content: space-between;">
              <span style="font-size: 15px; font-weight: bold; color: #111827;">Total Amount</span>
              <span style="font-size: 18px; font-weight: bold; color: #3B82F6;">Rs. ${totalAmount || 0}</span>
            </div>
          </div>

          <!-- Info Box -->
          <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px;">
            <p style="margin: 0; font-size: 13px; color: #92400E;">
              ⏰ Our team will contact you shortly to confirm the appointment time. Payment will be collected after service completion.
            </p>
          </div>

          <!-- Emergency Contact -->
          <div style="text-align: center; margin-bottom: 8px;">
            <p style="font-size: 13px; color: #6B7280; margin: 0;">Need help? Contact us:</p>
            <p style="font-size: 15px; font-weight: bold; color: #3B82F6; margin: 6px 0 0;">📞 +92 300 1234567</p>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #1F2937; padding: 20px 24px; text-align: center;">
          <p style="color: #9CA3AF; font-size: 12px; margin: 0;">© 2025 Ahmed Cooling & Appliances Workshop</p>
          <p style="color: #6B7280; font-size: 11px; margin: 6px 0 0;">Professional AC & Home Appliance Repair Services</p>
        </div>
      </div>
    `;

    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: {
          name: "Ahmed Cooling Workshop",
          email: "turabop37622@gmail.com"
        },
        to: [{ email: toEmail }],
        subject: `✅ Booking Confirmed - ${bookingId} | Ahmed Cooling`,
        htmlContent,
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Booking confirmation email sent:', response.data.messageId);
    return response.data;

  } catch (err) {
    // Email fail hone par booking cancel mat karo - sirf log karo
    console.error('❌ Booking email send failed:', err.response?.data || err.message);
  }
};

// ============================================
// DEBUG MIDDLEWARE
// ============================================
router.use((req, res, next) => {
  console.log(`📍 Booking Route: ${req.method} ${req.baseUrl}${req.path}`);
  next();
});

// ============================================
// PUBLIC ROUTES
// ============================================

// PUBLIC CANCEL BOOKING
router.put('/public/cancel/:bookingId', async (req, res) => {
  try {
    console.log('🚫 PUBLIC Cancel request for:', req.params.bookingId);
    const { reason, phone } = req.body;
    const booking = await Booking.findOne({ bookingId: req.params.bookingId });

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found', error: 'Booking not found' });
    if (phone && booking.phone !== phone) return res.status(403).json({ success: false, message: 'Phone number does not match booking' });
    if (!['pending', 'confirmed'].includes(booking.status)) return res.status(400).json({ success: false, message: `Booking cannot be cancelled in ${booking.status} status` });

    booking.status = 'cancelled';
    booking.cancellationReason = reason || 'Cancelled by customer';
    booking.cancelledAt = new Date();
    await booking.save();

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      data: { bookingId: booking.bookingId, status: booking.status, cancelledAt: booking.cancelledAt }
    });
  } catch (error) {
    console.error('❌ Public cancel error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// ✅ PUBLIC BOOKING - Email bhi bhejega
router.post('/public', [
  body('customerName').trim().notEmpty().withMessage('Customer name is required').isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('phone').trim().notEmpty().withMessage('Phone number is required').custom(phoneValidator),
  body('email').optional({ checkFalsy: true }).trim().isEmail().withMessage('Please enter a valid email'),
  body('service').notEmpty().withMessage('Service is required'),
  body('date').notEmpty().withMessage('Date is required'),
  body('time').notEmpty().withMessage('Time is required'),
  body('address').trim().notEmpty().withMessage('Address is required'),
  body('comments').optional().trim(),
  body('userId').optional({ checkFalsy: true }),
], async (req, res) => {
  try {
    console.log('📥 Public booking request:', req.body);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({ success: false, errors: errors.array(), message: errors.array()[0].msg });
    }

    const {
      customerName, phone, email, service, date, time,
      address, comments, coordinates, placeId, platform,
      language, userId, userEmail, userName,
    } = req.body;

    // userId validate karo
    let validUserId = null;
    if (userId) {
      try {
        const userExists = await User.findById(userId);
        if (userExists) {
          validUserId = userExists._id;
          console.log('✅ Logged-in user ki booking:', validUserId);
        } else {
          console.log('⚠️ userId invalid, guest booking');
        }
      } catch (err) {
        console.log('⚠️ userId format error, guest booking:', err.message);
      }
    }

    const bookingId = `BK${Date.now()}`;
    const orderNumber = `ORD-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Math.floor(Math.random() * 10000)}`;
    const servicePrice = service.basePrice || 0;
    const visitCharges = 200;
    const totalAmount = servicePrice + visitCharges;

    const booking = await Booking.create({
      bookingId,
      orderNumber,
      user: validUserId || undefined,
      customerName: customerName.trim(),
      phone: phone.trim(),
      email: email ? email.trim() : (userEmail || ''),
      service,
      date,
      time,
      address: address.trim(),
      comments: comments ? comments.trim() : '',
      coordinates: coordinates || { latitude: 0, longitude: 0 },
      placeId: placeId || '',
      platform: platform || 'android',
      language: language || 'en',
      status: 'pending',
      servicePrice,
      visitCharges,
      totalAmount,
      statusHistory: [{
        status: 'pending',
        timestamp: new Date(),
        note: validUserId ? `Booking by user: ${userName || customerName}` : 'Guest booking'
      }],
      createdAt: new Date()
    });

    console.log('✅ Booking created:', bookingId, validUserId ? `(User: ${validUserId})` : '(Guest)');

    // ✅ EMAIL BHEJO - booking ke baad (fail hone par booking cancel nahi hogi)
    const emailTo = email || userEmail || null;
    if (emailTo) {
      sendBookingConfirmationEmail(emailTo, {
        bookingId,
        orderNumber,
        customerName: customerName.trim(),
        serviceName: service.name || service.titleKey || 'AC Service',
        serviceIcon: service.icon || '❄️',
        date,
        time,
        address: address.trim(),
        servicePrice,
        visitCharges,
        totalAmount,
      });
      // await nahi - background mein chalega taake response slow na ho
    }

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: {
        booking,
        bookingId: booking.bookingId,
        isLinkedToUser: !!validUserId
      }
    });

  } catch (error) {
    console.error('❌ Public booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to create booking', error: error.message });
  }
});

// GET SINGLE BOOKING (PUBLIC)
router.get('/public/:bookingId', async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, data: { booking } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// GET BOOKINGS BY PHONE (PUBLIC)
router.get('/phone/:phone', async (req, res) => {
  try {
    const bookings = await Booking.find({ phone: req.params.phone }).sort({ createdAt: -1 });
    res.json({ success: true, data: { bookings } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// ============================================
// AUTH PROTECTED ROUTES
// ============================================

// GET MY BOOKINGS
router.get('/user/my-bookings', auth, async (req, res) => {
  try {
    console.log('🔍 Fetching bookings for user:', req.user.userId);
    const { status, limit = 10, page = 1 } = req.query;
    const query = { user: req.user.userId };
    if (status) query.status = status;
    const skip = (page - 1) * limit;

    const bookings = await Booking.find(query)
      .populate('service', 'name nameAr icon basePrice category')
      .populate('technician', 'name phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);
    console.log(`✅ Found ${bookings.length} bookings for user ${req.user.userId}`);

    res.json({
      success: true,
      bookings,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('❌ Get my bookings error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// CREATE BOOKING (AUTH) - Email bhi bhejega
router.post('/', auth, [
  body('serviceId').notEmpty().withMessage('Service ID is required'),
  body('scheduledDate').notEmpty().withMessage('Scheduled date is required'),
  body('scheduledTime').notEmpty().withMessage('Scheduled time is required'),
  body('address').notEmpty().withMessage('Address is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required').custom(phoneValidator),
  body('problemDescription').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array(), message: errors.array()[0].msg });

    const { serviceId, scheduledDate, scheduledTime, address, phone, problemDescription, priority = 'normal', images = [], technicianId } = req.body;

    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const booking = new Booking({
      user: req.user.userId,
      service: serviceId,
      scheduledDate,
      scheduledTime,
      address,
      phone: phone.trim(),
      problemDescription,
      priority,
      images,
      estimatedCost: service.basePrice,
      status: 'pending'
    });

    if (technicianId) {
      const technician = await Technician.findOne({ user: technicianId });
      if (technician && technician.availability) {
        booking.technician = technicianId;
        booking.status = 'assigned';
      }
    }

    await booking.save();
    await booking.populate('service', 'name nameAr icon basePrice');

    // Notification
    await new Notification({
      user: req.user.userId,
      type: 'booking',
      title: 'Booking Confirmed',
      message: `Your booking for ${service.name} has been confirmed. Order #${booking.orderNumber}`,
      data: { bookingId: booking._id, orderNumber: booking.orderNumber }
    }).save();

    // ✅ EMAIL BHEJO
    if (user.email) {
      sendBookingConfirmationEmail(user.email, {
        bookingId: booking.bookingId || booking._id.toString(),
        orderNumber: booking.orderNumber,
        customerName: user.name || user.fullName || 'Customer',
        serviceName: service.name || 'AC Service',
        serviceIcon: service.icon || '❄️',
        date: scheduledDate,
        time: scheduledTime,
        address,
        servicePrice: service.basePrice || 0,
        visitCharges: 200,
        totalAmount: (service.basePrice || 0) + 200,
      });
    }

    res.status(201).json({ success: true, message: 'Booking created successfully', booking });

  } catch (error) {
    console.error('❌ Create booking error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// GET SINGLE BOOKING (AUTH)
router.get('/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('service', 'name nameAr icon basePrice description descriptionAr warrantyDays')
      .populate('technician', 'name phone rating experience')
      .populate('user', 'name email phone address');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (booking.user && booking.user._id.toString() !== req.user.userId && req.user.role !== 'admin' && req.user.role !== 'technician') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, booking });
  } catch (error) {
    console.error('❌ Get booking error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// UPDATE BOOKING (AUTH)
router.put('/:id', auth, [
  body('phone').optional().trim().custom((value) => {
    if (value && !validateInternationalPhone(value)) throw new Error('Please enter a valid international phone number');
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array(), message: errors.array()[0].msg });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.user && booking.user.toString() !== req.user.userId && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Access denied' });

    const allowedUpdates = ['address', 'phone', 'problemDescription', 'images'];
    if (booking.status === 'pending') allowedUpdates.push('scheduledDate', 'scheduledTime');

    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) booking[key] = key === 'phone' ? req.body[key].trim() : req.body[key];
    });

    await booking.save();
    await booking.populate('service', 'name nameAr icon basePrice');

    res.json({ success: true, message: 'Booking updated successfully', booking });
  } catch (error) {
    console.error('❌ Update booking error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// CANCEL BOOKING (AUTH)
router.put('/:id/cancel', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.user && booking.user.toString() !== req.user.userId && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Access denied' });
    if (!['pending', 'confirmed'].includes(booking.status)) return res.status(400).json({ success: false, message: `Booking cannot be cancelled in ${booking.status} status` });

    booking.status = 'cancelled';
    booking.cancellationReason = reason;
    await booking.save();

    if (booking.user) {
      await new Notification({ user: booking.user, type: 'booking', title: 'Booking Cancelled', message: `Your booking #${booking.orderNumber} has been cancelled.`, data: { bookingId: booking._id, orderNumber: booking.orderNumber } }).save();
    }
    if (booking.technician) {
      await new Notification({ user: booking.technician, type: 'booking', title: 'Booking Cancelled', message: `Booking #${booking.orderNumber} has been cancelled.`, data: { bookingId: booking._id, orderNumber: booking.orderNumber } }).save();
    }

    res.json({ success: true, message: 'Booking cancelled successfully', booking });
  } catch (error) {
    console.error('❌ Cancel booking error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// UPDATE BOOKING STATUS (Admin/Technician)
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (req.user.role !== 'admin' && req.user.role !== 'technician') return res.status(403).json({ success: false, message: 'Access denied' });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const validTransitions = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['assigned', 'cancelled'],
      assigned: ['on_the_way', 'cancelled'],
      on_the_way: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled']
    };

    if (!validTransitions[booking.status]?.includes(status)) return res.status(400).json({ success: false, message: `Invalid status transition from ${booking.status} to ${status}` });

    booking.status = status;
    if (notes) booking.technicianNotes = notes;
    if (req.user.role === 'technician' && !booking.technician) booking.technician = req.user.userId;
    await booking.save();

    const statusMessages = { confirmed: 'confirmed', assigned: 'assigned to a technician', on_the_way: 'technician is on the way', in_progress: 'in progress', completed: 'completed', cancelled: 'cancelled' };

    if (booking.user) {
      await new Notification({ user: booking.user, type: 'booking', title: `Booking ${statusMessages[status]}`, message: `Your booking #${booking.orderNumber} is now ${statusMessages[status]}.`, data: { bookingId: booking._id, orderNumber: booking.orderNumber, status } }).save();
    }

    res.json({ success: true, message: `Booking status updated to ${status}`, booking });
  } catch (error) {
    console.error('❌ Update status error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// SUBMIT FEEDBACK (AUTH)
router.post('/:id/feedback', auth, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.user.toString() !== req.user.userId) return res.status(403).json({ success: false, message: 'Access denied' });
    if (booking.status !== 'completed') return res.status(400).json({ success: false, message: 'Feedback can only be submitted for completed bookings' });
    if (booking.customerFeedback) return res.status(400).json({ success: false, message: 'Feedback already submitted' });

    booking.customerFeedback = { rating, comment, date: new Date() };
    await booking.save();

    if (booking.technician) {
      const technician = await Technician.findOne({ user: booking.technician });
      if (technician) {
        const newTotalRatings = technician.totalRatings + 1;
        technician.rating = parseFloat(((technician.rating * technician.totalRatings + rating) / newTotalRatings).toFixed(1));
        technician.totalRatings = newTotalRatings;
        technician.completedJobs += 1;
        await technician.save();
      }
    }

    res.json({ success: true, message: 'Feedback submitted successfully', booking });
  } catch (error) {
    console.error('❌ Submit feedback error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// TRACK TECHNICIAN (AUTH)
router.get('/:id/track', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.user.toString() !== req.user.userId && req.user.role !== 'admin' && req.user.role !== 'technician') return res.status(403).json({ success: false, message: 'Access denied' });

    let location = null;
    if (booking.technician) {
      const technician = await Technician.findOne({ user: booking.technician });
      if (technician?.currentLocation) location = { coordinates: technician.currentLocation.coordinates, lastUpdated: technician.currentLocation.lastUpdated };
    }

    res.json({ success: true, location, status: booking.status, estimatedArrival: booking.status === 'on_the_way' ? '15-20 minutes' : null });
  } catch (error) {
    console.error('❌ Track booking error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

module.exports = router;