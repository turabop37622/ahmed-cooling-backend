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
// AUTH MIDDLEWARE - Inline (no external file needed)
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
// PHONE VALIDATION FUNCTION - International
// ============================================
const validateInternationalPhone = (phone) => {
  // Sirf numbers aur + rakhein
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  
  // International phone number pattern - More flexible
  // + se shuru, phir minimum 7 digits (allows 7-15 digit variations)
  const internationalRegex = /^\+[1-9]\d{6,14}$/;
  
  if (!cleanPhone.startsWith('+')) {
    return false;
  }
  
  // Check length: + plus at least 7 digits = minimum 8 chars
  if (cleanPhone.length < 8 || cleanPhone.length > 16) {
    return false;
  }
  
  return internationalRegex.test(cleanPhone);
};

// Custom validator for express-validator
const phoneValidator = (value) => {
  if (!validateInternationalPhone(value)) {
    throw new Error('Please enter a valid international phone number (e.g., +923001234567, +12025551234)');
  }
  return true;
};

// ============================================
// ✅ DEBUG MIDDLEWARE - Log all incoming requests
// ============================================
router.use((req, res, next) => {
  console.log(`📍 Booking Route: ${req.method} ${req.baseUrl}${req.path}`);
  next();
});

// ============================================
// ✅ PUBLIC ROUTES - MUST BE FIRST & SPECIFIC
// ============================================

// PUBLIC CANCEL BOOKING (NO AUTH - sirf bookingId se)
router.put('/public/cancel/:bookingId', async (req, res) => {
  try {
    console.log('🚫 PUBLIC Cancel request for:', req.params.bookingId);
    
    const { reason, phone } = req.body;
    
    // bookingId se dhundho (public booking ke liye)
    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    
    if (!booking) {
      console.log('❌ Booking not found:', req.params.bookingId);
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
        error: 'Booking not found'
      });
    }

    // SECURITY: Phone verification karo
    if (phone && booking.phone !== phone) {
      return res.status(403).json({
        success: false,
        message: 'Phone number does not match booking'
      });
    }

    // Check if booking can be cancelled
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

    console.log('✅ Public booking cancelled:', booking.bookingId);

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
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// PUBLIC BOOKING (NO AUTH REQUIRED)
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
    .optional({ checkFalsy: true })  // ✅ FIXED: Empty string ko bhi optional maan lo
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
], async (req, res) => {
  try {
    console.log('📥 Public booking request:', req.body);

    // Validation
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
      language
    } = req.body;

    // Generate unique booking ID and order number
    const bookingId = `BK${Date.now()}`;
    const orderNumber = `ORD-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Math.floor(Math.random() * 10000)}`;

    // Create booking
    const booking = await Booking.create({
      bookingId,
      orderNumber,
      customerName: customerName.trim(),
      phone: phone.trim(),
      email: email ? email.trim() : '',
      service,
      date,
      time,
      address: address.trim(),
      comments: comments ? comments.trim() : '',
      coordinates: coordinates || { latitude: 0, longitude: 0 },
      placeId: placeId || '',
      platform: platform || 'web',
      language: language || 'en',
      status: 'pending',
      servicePrice: service.basePrice || 0,
      visitCharges: 200,
      totalAmount: (service.basePrice || 0) + 200,
      statusHistory: [{
        status: 'pending',
        timestamp: new Date(),
        note: 'Booking created'
      }],
      createdAt: new Date()
    });

    console.log('✅ Public booking created:', bookingId);

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: {
        booking,
        bookingId: booking.bookingId
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
// ✅ AUTH PROTECTED ROUTES - AFTER PUBLIC
// ============================================

// CREATE BOOKING (AUTH REQUIRED)
router.post('/', auth, [
  body('serviceId').notEmpty().withMessage('Service ID is required'),
  body('scheduledDate').notEmpty().withMessage('Scheduled date is required'),
  body('scheduledTime').notEmpty().withMessage('Scheduled time is required'),
  body('address').notEmpty().withMessage('Address is required'),
  // UPDATED: International phone validation
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .custom(phoneValidator),
  body('problemDescription').optional()
], async (req, res) => {
  try {
    // Validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array(),
        message: errors.array()[0].msg // First error message
      });
    }

    const { 
      serviceId, 
      scheduledDate, 
      scheduledTime, 
      address, 
      phone, 
      problemDescription,
      priority = 'normal',
      images = [],
      technicianId 
    } = req.body;

    // Check if service exists
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Get user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Create booking
    const booking = new Booking({
      user: req.user.id,
      service: serviceId,
      scheduledDate,
      scheduledTime,
      address,
      phone: phone.trim(), // Trim whitespace
      problemDescription,
      priority,
      images,
      estimatedCost: service.basePrice,
      status: 'pending'
    });

    // Assign technician if specified
    if (technicianId) {
      const technician = await Technician.findOne({ user: technicianId });
      if (technician && technician.availability) {
        booking.technician = technicianId;
        booking.status = 'assigned';
      }
    }

    await booking.save();

    // Populate booking with service details
    await booking.populate('service', 'name nameAr icon basePrice');

    // Create notification
    const notification = new Notification({
      user: req.user.id,
      type: 'booking',
      title: 'Booking Confirmed',
      message: `Your booking for ${service.name} has been confirmed. Order #${booking.orderNumber}`,
      data: { bookingId: booking._id, orderNumber: booking.orderNumber }
    });
    await notification.save();

    // TODO: Send email/SMS notification
    // TODO: Notify available technicians

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      booking
    });

  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// GET USER BOOKINGS
router.get('/my-bookings', auth, async (req, res) => {
  try {
    const { status, limit = 10, page = 1 } = req.query;
    
    const query = { user: req.user.id };
    if (status) {
      query.status = status;
    }

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
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// GET SINGLE BOOKING
router.get('/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('service', 'name nameAr icon basePrice description descriptionAr warrantyDays')
      .populate('technician', 'name phone rating experience')
      .populate('user', 'name email phone address');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user owns the booking or is admin/technician
    if (booking.user._id.toString() !== req.user.id && 
        req.user.role !== 'admin' && 
        req.user.role !== 'technician') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      booking
    });

  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// UPDATE BOOKING
router.put('/:id', auth, [
  body('phone')
    .optional()
    .trim()
    .custom((value) => {
      if (value && !validateInternationalPhone(value)) {
        throw new Error('Please enter a valid international phone number');
      }
      return true;
    })
], async (req, res) => {
  try {
    // Validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array(),
        message: errors.array()[0].msg
      });
    }

    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check permissions
    if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Only allow certain updates based on status
    const allowedUpdates = ['address', 'phone', 'problemDescription', 'images'];
    if (booking.status === 'pending') {
      allowedUpdates.push('scheduledDate', 'scheduledTime');
    }

    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        booking[key] = key === 'phone' ? req.body[key].trim() : req.body[key];
      }
    });

    await booking.save();
    await booking.populate('service', 'name nameAr icon basePrice');

    res.json({
      success: true,
      message: 'Booking updated successfully',
      booking
    });

  } catch (error) {
    console.error('Update booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// CANCEL BOOKING (AUTH REQUIRED)
router.put('/:id/cancel', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check permissions
    if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if booking can be cancelled
    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Booking cannot be cancelled in ${booking.status} status`
      });
    }

    booking.status = 'cancelled';
    booking.cancellationReason = reason;
    await booking.save();

    // Create notification
    const notification = new Notification({
      user: booking.user,
      type: 'booking',
      title: 'Booking Cancelled',
      message: `Your booking #${booking.orderNumber} has been cancelled.`,
      data: { bookingId: booking._id, orderNumber: booking.orderNumber }
    });
    await notification.save();

    // Notify technician if assigned
    if (booking.technician) {
      const techNotification = new Notification({
        user: booking.technician,
        type: 'booking',
        title: 'Booking Cancelled',
        message: `Booking #${booking.orderNumber} has been cancelled.`,
        data: { bookingId: booking._id, orderNumber: booking.orderNumber }
      });
      await techNotification.save();
    }

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      booking
    });

  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// UPDATE BOOKING STATUS (Admin/Technician only)
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    if (req.user.role !== 'admin' && req.user.role !== 'technician') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Validate status transition
    const validTransitions = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['assigned', 'cancelled'],
      assigned: ['on_the_way', 'cancelled'],
      on_the_way: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled']
    };

    if (!validTransitions[booking.status]?.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition from ${booking.status} to ${status}`
      });
    }

    booking.status = status;
    if (notes) {
      booking.technicianNotes = notes;
    }

    // If technician is updating status and not assigned, assign them
    if (req.user.role === 'technician' && !booking.technician) {
      booking.technician = req.user.id;
    }

    await booking.save();

    // Create notification for customer
    const statusMessages = {
      confirmed: 'confirmed',
      assigned: 'assigned to a technician',
      on_the_way: 'technician is on the way',
      in_progress: 'in progress',
      completed: 'completed',
      cancelled: 'cancelled'
    };

    const notification = new Notification({
      user: booking.user,
      type: 'booking',
      title: `Booking ${statusMessages[status]}`,
      message: `Your booking #${booking.orderNumber} is now ${statusMessages[status]}.`,
      data: { bookingId: booking._id, orderNumber: booking.orderNumber, status }
    });
    await notification.save();

    res.json({
      success: true,
      message: `Booking status updated to ${status}`,
      booking
    });

  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// SUBMIT FEEDBACK
router.post('/:id/feedback', auth, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user owns the booking
    if (booking.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if booking is completed
    if (booking.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Feedback can only be submitted for completed bookings'
      });
    }

    // Check if feedback already submitted
    if (booking.customerFeedback) {
      return res.status(400).json({
        success: false,
        message: 'Feedback already submitted for this booking'
      });
    }

    booking.customerFeedback = {
      rating,
      comment,
      date: new Date()
    };

    await booking.save();

    // Update technician rating
    if (booking.technician) {
      const technician = await Technician.findOne({ user: booking.technician });
      if (technician) {
        const newTotalRatings = technician.totalRatings + 1;
        const newRating = ((technician.rating * technician.totalRatings) + rating) / newTotalRatings;
        
        technician.rating = parseFloat(newRating.toFixed(1));
        technician.totalRatings = newTotalRatings;
        technician.completedJobs += 1;
        
        await technician.save();
      }
    }

    res.json({
      success: true,
      message: 'Feedback submitted successfully',
      booking
    });

  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// TRACK TECHNICIAN LOCATION
router.get('/:id/track', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user owns the booking
    if (booking.user.toString() !== req.user.id && 
        req.user.role !== 'admin' && 
        req.user.role !== 'technician') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get technician location
    let location = null;
    if (booking.technician) {
      const technician = await Technician.findOne({ user: booking.technician });
      if (technician && technician.currentLocation) {
        location = {
          coordinates: technician.currentLocation.coordinates,
          lastUpdated: technician.currentLocation.lastUpdated
        };
      }
    }

    res.json({
      success: true,
      location,
      status: booking.status,
      estimatedArrival: booking.status === 'on_the_way' ? '15-20 minutes' : null
    });

  } catch (error) {
    console.error('Track booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;