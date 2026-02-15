const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Technician = require('../models/Technician');
const User = require('../models/User');
const Booking = require('../models/Booking');
const { body, validationResult } = require('express-validator');

// Get all technicians
router.get('/', async (req, res) => {
  try {
    const { available, skill, minRating, limit = 20, page = 1 } = req.query;
    
    const query = { active: true };
    
    if (available === 'true') {
      query.availability = true;
    }
    
    if (skill) {
      query.skills = skill;
    }
    
    if (minRating) {
      query.rating = { $gte: parseFloat(minRating) };
    }

    const skip = (page - 1) * limit;
    
    const technicians = await Technician.find(query)
      .populate('user', 'name email phone profileImage')
      .sort({ rating: -1, completedJobs: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Technician.countDocuments(query);

    res.json({
      success: true,
      technicians,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get technicians error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get nearby technicians
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 10, limit = 10 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const technicians = await Technician.find({
      active: true,
      availability: true,
      currentLocation: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: radius * 1000 // Convert km to meters
        }
      }
    })
    .populate('user', 'name email phone profileImage')
    .limit(parseInt(limit));

    res.json({
      success: true,
      technicians
    });

  } catch (error) {
    console.error('Get nearby technicians error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get single technician
router.get('/:id', async (req, res) => {
  try {
    const technician = await Technician.findById(req.params.id)
      .populate('user', 'name email phone profileImage address')
      .populate({
        path: 'certifications',
        options: { sort: { expiryDate: -1 } }
      });

    if (!technician) {
      return res.status(404).json({
        success: false,
        message: 'Technician not found'
      });
    }

    // Get technician's recent bookings
    const recentBookings = await Booking.find({ 
      technician: technician.user._id,
      status: 'completed'
    })
    .populate('service', 'name nameAr')
    .populate('user', 'name')
    .sort({ createdAt: -1 })
    .limit(5);

    // Get technician's ratings
    const ratings = await Booking.find({
      technician: technician.user._id,
      'customerFeedback.rating': { $exists: true }
    })
    .select('customerFeedback')
    .sort({ 'customerFeedback.date': -1 })
    .limit(10);

    res.json({
      success: true,
      technician: {
        ...technician.toObject(),
        recentBookings,
        ratings
      }
    });

  } catch (error) {
    console.error('Get technician error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Update technician location
router.put('/location', auth, async (req, res) => {
  try {
    // Check if user is a technician
    if (req.user.role !== 'technician') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Technician only.'
      });
    }

    const { lat, lng } = req.body;
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const technician = await Technician.findOneAndUpdate(
      { user: req.user.id },
      {
        currentLocation: {
          type: 'Point',
          coordinates: [parseFloat(lng), parseFloat(lat)],
          lastUpdated: new Date()
        }
      },
      { new: true }
    );

    if (!technician) {
      return res.status(404).json({
        success: false,
        message: 'Technician profile not found'
      });
    }

    res.json({
      success: true,
      message: 'Location updated successfully',
      location: technician.currentLocation
    });

  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Update technician availability
router.put('/availability', auth, async (req, res) => {
  try {
    // Check if user is a technician
    if (req.user.role !== 'technician') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Technician only.'
      });
    }

    const { availability } = req.body;
    
    const technician = await Technician.findOneAndUpdate(
      { user: req.user.id },
      { availability },
      { new: true }
    );

    if (!technician) {
      return res.status(404).json({
        success: false,
        message: 'Technician profile not found'
      });
    }

    res.json({
      success: true,
      message: `Availability updated to ${availability ? 'available' : 'unavailable'}`,
      availability: technician.availability
    });

  } catch (error) {
    console.error('Update availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get technician's bookings
router.get('/my-bookings', auth, async (req, res) => {
  try {
    // Check if user is a technician
    if (req.user.role !== 'technician') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Technician only.'
      });
    }

    const { status, limit = 10, page = 1 } = req.query;
    
    const query = { technician: req.user.id };
    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;
    
    const bookings = await Booking.find(query)
      .populate('service', 'name nameAr icon')
      .populate('user', 'name phone address')
      .sort({ scheduledDate: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    // Get today's bookings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todaysBookings = await Booking.find({
      technician: req.user.id,
      scheduledDate: {
        $gte: today,
        $lt: tomorrow
      },
      status: { $in: ['confirmed', 'assigned', 'on_the_way', 'in_progress'] }
    })
    .populate('service', 'name nameAr')
    .populate('user', 'name phone address')
    .sort({ scheduledTime: 1 });

    res.json({
      success: true,
      bookings,
      todaysBookings,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get technician bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get technician dashboard stats
router.get('/dashboard/stats', auth, async (req, res) => {
  try {
    // Check if user is a technician
    if (req.user.role !== 'technician') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Technician only.'
      });
    }

    const technician = await Technician.findOne({ user: req.user.id });
    if (!technician) {
      return res.status(404).json({
        success: false,
        message: 'Technician profile not found'
      });
    }

    // Get monthly stats
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const monthlyBookings = await Booking.find({
      technician: req.user.id,
      createdAt: { $gte: firstDayOfMonth, $lte: lastDayOfMonth }
    });

    const completedThisMonth = monthlyBookings.filter(b => b.status === 'completed').length;
    const inProgress = monthlyBookings.filter(b => b.status === 'in_progress').length;
    
    const totalEarnings = monthlyBookings
      .filter(b => b.status === 'completed')
      .reduce((sum, booking) => sum + (booking.finalCost || booking.estimatedCost), 0);

    // Get upcoming bookings
    const upcomingBookings = await Booking.find({
      technician: req.user.id,
      status: { $in: ['confirmed', 'assigned'] },
      scheduledDate: { $gte: new Date() }
    })
    .populate('service', 'name nameAr')
    .populate('user', 'name phone')
    .sort({ scheduledDate: 1 })
    .limit(5);

    res.json({
      success: true,
      stats: {
        rating: technician.rating,
        totalRatings: technician.totalRatings,
        completedJobs: technician.completedJobs,
        completedThisMonth,
        inProgress,
        totalEarnings,
        availability: technician.availability
      },
      upcomingBookings
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;