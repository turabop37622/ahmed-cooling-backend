const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const User = require('../models/User');
const Technician = require('../models/Technician');
const Notification = require('../models/Notification');
const { body, validationResult } = require('express-validator');

// ============================================
// AUTH MIDDLEWARE
// ============================================
const JWT_SECRET = process.env.JWT_SECRET || 'ahmed-cooling-secret-key-2024-secure-token';

const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// ============================================
// PHONE VALIDATION FUNCTION
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
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
        error: 'Booking not found'
      });
    }

    if (phone && booking.phone !== phone) {
      return res.status(403).json({
        success: false,
        message: 'Phone number does not match booking'
      });
    }

    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Booking cannot be cancelled in ${booking.status} status`
      });
    }

    booking.status = 'cancelled';
    booking.cancellationReason = reason || 'Cancelled by customer';
    booking.cancelledAt = new Date();
    await booking.save();

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      data: {
        bookingId: booking.bookingId,
        status: booking.status,
        cancelledAt: booking.cancelledAt
      }
    });

  } catch (error) {
    console.error('❌ Public cancel error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// ============================================
// ✅ PUBLIC BOOKING - userId support added
// ============================================
router.post('/public', [
  body('customerName')
    .trim()
    .notEmpty().withMessage('Customer name is required')
    .isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .custom(phoneValidator),
  body('email')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail().withMessage('Please enter a valid email'),
  body('service')
    .notEmpty().withMessage('Service is required'),
  body('date')
    .notEmpty().withMessage('Date is required'),
  body('time')
    .notEmpty().withMessage('Time is required'),
  body('address')
    .trim()
    .notEmpty().withMessage('Address is required'),
  body('comments').optional().trim(),
  // ✅ userId optional hai - agar logged in hai to ayega
  body('userId').optional({ checkFalsy: true }),
], async (req, res) => {
  try {
    console.log('📥 Public booking request:', req.body);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({ 
        success: false, 
        errors: errors.array(),
        message: errors.array()[0].msg
      });
    }

    const {
      customerName,
      phone,
      email,
      service,
      date,
      time,
      address,
      comments,
      coordinates,
      placeId,
      platform,
      language,
      // ✅ NAYE FIELDS - user se linked booking
      userId,
      userEmail,
      userName,
    } = req.body;

    // ✅ Agar userId aaya hai to check karo ke valid User hai
    let validUserId = null;
    if (userId) {
      try {
        const userExists = await User.findById(userId);
        if (userExists) {
          validUserId = userExists._id;
          console.log('✅ Logged-in user ki booking:', validUserId);
        } else {
          console.log('⚠️ userId aaya lekin user nahi mila, guest booking banate hain');
        }
      } catch (err) {
        console.log('⚠️ userId invalid format, guest booking banate hain:', err.message);
      }
    }

    const bookingId = `BK${Date.now()}`;
    const orderNumber = `ORD-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Math.floor(Math.random() * 10000)}`;

    // ✅ UPDATED - user field set karo agar valid userId hai
    const booking = await Booking.create({
      bookingId,
      orderNumber,
      // ✅ Yahi hai asli fix - user field set ho raha hai
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
      servicePrice: service.basePrice || 0,
      visitCharges: 200,
      totalAmount: (service.basePrice || 0) + 200,
      statusHistory: [{
        status: 'pending',
        timestamp: new Date(),
        note: validUserId 
          ? `Booking created by logged-in user: ${userName || customerName}`
          : 'Booking created by guest'
      }],
      createdAt: new Date()
    });

    console.log('✅ Booking created:', bookingId, validUserId ? `(User: ${validUserId})` : '(Guest)');

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: {
        booking,
        bookingId: booking.bookingId,
        // ✅ Frontend ko bata do ke user se linked hai ya nahi
        isLinkedToUser: !!validUserId
      }
    });

  } catch (error) {
    console.error('❌ Public booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create booking',
      error: error.message
    });
  }
});

// ============================================
// GET BOOKINGS BY USER ID (PUBLIC - token se)
// ✅ NAYA ROUTE - User apni saari bookings dekh sake
// ============================================
router.get('/public/:bookingId', async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    res.json({ success: true, data: { booking } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// GET BOOKINGS BY PHONE
router.get('/phone/:phone', async (req, res) => {
  try {
    const bookings = await Booking.find({ phone: req.params.phone })
      .sort({ createdAt: -1 });

    res.json({ success: true, data: { bookings } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// PATCH BOOKING STATUS
router.patch('/:bookingId/status', async (req, res) => {
  try {
    const { status, note } = req.body;
    const booking = await Booking.findOne({ bookingId: req.params.bookingId });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    booking.status = status;
    booking.statusHistory.push({ status, timestamp: new Date(), note: note || '' });
    await booking.save();

    res.json({ success: true, data: { booking } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// ============================================
// AUTH PROTECTED ROUTES
// ============================================

// CREATE BOOKING (AUTH REQUIRED)
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
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array(),
        message: errors.array()[0].msg
      });
    }

    const { serviceId, scheduledDate, scheduledTime, address, phone, problemDescription, priority = 'normal', images = [], technicianId } = req.body;

    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const booking = new Booking({
      user: req.user.id,
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

    const notification = new Notification({
      user: req.user.id,
      type: 'booking',
      title: 'Booking Confirmed',
      message: `Your booking for ${service.name} has been confirmed. Order #${booking.orderNumber}`,
      data: { bookingId: booking._id, orderNumber: booking.orderNumber }
    });
    await notification.save();

    res.status(201).json({ success: true, message: 'Booking created successfully', booking });

  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET USER BOOKINGS (AUTH)
router.get('/my-bookings', auth, async (req, res) => {
  try {
    const { status, limit = 10, page = 1 } = req.query;
    
    const query = { user: req.user.id };
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    
    const bookings = await Booking.find(query)
      .populate('service', 'name nameAr icon basePrice category')
      .populate('technician', 'name phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    res.json({
      success: true,
      bookings,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
    });

  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET SINGLE BOOKING (AUTH)
router.get('/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('service', 'name nameAr icon basePrice description descriptionAr warrantyDays')
      .populate('technician', 'name phone rating experience')
      .populate('user', 'name email phone address');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.user._id.toString() !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'technician') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, booking });

  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// UPDATE BOOKING (AUTH)
router.put('/:id', auth, [
  body('phone').optional().trim().custom((value) => {
    if (value && !validateInternationalPhone(value)) {
      throw new Error('Please enter a valid international phone number');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array(), message: errors.array()[0].msg });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const allowedUpdates = ['address', 'phone', 'problemDescription', 'images'];
    if (booking.status === 'pending') allowedUpdates.push('scheduledDate', 'scheduledTime');

    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        booking[key] = key === 'phone' ? req.body[key].trim() : req.body[key];
      }
    });

    await booking.save();
    await booking.populate('service', 'name nameAr icon basePrice');

    res.json({ success: true, message: 'Booking updated successfully', booking });

  } catch (error) {
    console.error('Update booking error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// CANCEL BOOKING (AUTH)
router.put('/:id/cancel', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: `Booking cannot be cancelled in ${booking.status} status` });
    }

    booking.status = 'cancelled';
    booking.cancellationReason = reason;
    await booking.save();

    const notification = new Notification({
      user: booking.user,
      type: 'booking',
      title: 'Booking Cancelled',
      message: `Your booking #${booking.orderNumber} has been cancelled.`,
      data: { bookingId: booking._id, orderNumber: booking.orderNumber }
    });
    await notification.save();

    if (booking.technician) {
      await new Notification({
        user: booking.technician,
        type: 'booking',
        title: 'Booking Cancelled',
        message: `Booking #${booking.orderNumber} has been cancelled.`,
        data: { bookingId: booking._id, orderNumber: booking.orderNumber }
      }).save();
    }

    res.json({ success: true, message: 'Booking cancelled successfully', booking });

  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// UPDATE BOOKING STATUS (Admin/Technician)
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    if (req.user.role !== 'admin' && req.user.role !== 'technician') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const validTransitions = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['assigned', 'cancelled'],
      assigned: ['on_the_way', 'cancelled'],
      on_the_way: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled']
    };

    if (!validTransitions[booking.status]?.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status transition from ${booking.status} to ${status}` });
    }

    booking.status = status;
    if (notes) booking.technicianNotes = notes;
    if (req.user.role === 'technician' && !booking.technician) booking.technician = req.user.id;

    await booking.save();

    const statusMessages = {
      confirmed: 'confirmed', assigned: 'assigned to a technician',
      on_the_way: 'technician is on the way', in_progress: 'in progress',
      completed: 'completed', cancelled: 'cancelled'
    };

    await new Notification({
      user: booking.user,
      type: 'booking',
      title: `Booking ${statusMessages[status]}`,
      message: `Your booking #${booking.orderNumber} is now ${statusMessages[status]}.`,
      data: { bookingId: booking._id, orderNumber: booking.orderNumber, status }
    }).save();

    res.json({ success: true, message: `Booking status updated to ${status}`, booking });

  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// SUBMIT FEEDBACK (AUTH)
router.post('/:id/feedback', auth, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.user.toString() !== req.user.id) return res.status(403).json({ success: false, message: 'Access denied' });
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
    console.error('Submit feedback error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// TRACK TECHNICIAN (AUTH)
router.get('/:id/track', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (booking.user.toString() !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'technician') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    let location = null;
    if (booking.technician) {
      const technician = await Technician.findOne({ user: booking.technician });
      if (technician?.currentLocation) {
        location = { coordinates: technician.currentLocation.coordinates, lastUpdated: technician.currentLocation.lastUpdated };
      }
    }

    res.json({ success: true, location, status: booking.status, estimatedArrival: booking.status === 'on_the_way' ? '15-20 minutes' : null });

  } catch (error) {
    console.error('Track booking error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;