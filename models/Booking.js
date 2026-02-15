const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  // Unique identifiers
  bookingId: {
    type: String,
    unique: true,
    sparse: true // Allows multiple null values for backward compatibility
  },
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  
  // ============================================
  // USER REFERENCES (Optional for public bookings)
  // ============================================
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false  // ✅ Changed to false for public bookings
  },
  
  // ============================================
  // SERVICE (Can be ObjectId OR embedded object)
  // ============================================
  service: {
    type: mongoose.Schema.Types.Mixed,  // ✅ Allows both ObjectId and Object
    required: false  // ✅ Made optional
  },
  
  // Service details for public bookings (when service is an object)
  serviceDetails: {
    name: String,
    icon: String,
    price: Number,
    category: String
  },
  
  technician: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // ============================================
  // CUSTOMER INFO (for public bookings)
  // ============================================
  customerName: {
    type: String,
    required: false  // Will be required in public route validation
  },
  email: {
    type: String,
    required: false
  },
  
  // ============================================
  // SCHEDULE
  // ============================================
  scheduledDate: {
    type: Date,
    required: false  // ✅ Made optional (will be set from date/time)
  },
  scheduledTime: {
    type: String,
    required: false  // ✅ Made optional
  },
  
  // Public booking fields (from frontend)
  date: {
    type: String  // "2026-02-16" format
  },
  time: {
    type: String  // "06:00 PM" format
  },
  
  // ============================================
  // LOCATION
  // ============================================
  address: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  
  coordinates: {
    latitude: { type: Number, default: 0 },
    longitude: { type: Number, default: 0 }
  },
  
  placeId: {
    type: String
  },
  
  // ============================================
  // BOOKING DETAILS
  // ============================================
  problemDescription: {
    type: String,
    default: ''
  },
  comments: {
    type: String,
    default: ''
  },
  images: [{
    type: String
  }],
  
  // ============================================
  // STATUS & PRICING
  // ============================================
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'assigned', 'on_the_way', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['normal', 'emergency'],
    default: 'normal'
  },
  
  // Pricing
  estimatedCost: {
    type: Number,
    required: false,  // ✅ Made optional
    default: 0
  },
  servicePrice: {
    type: Number,
    default: 0
  },
  visitCharges: {
    type: Number,
    default: 200
  },
  totalAmount: {
    type: Number,
    default: 0
  },
  finalCost: {
    type: Number
  },
  
  // ============================================
  // PAYMENT
  // ============================================
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'partially_paid'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'bank_transfer', 'mobile_payment']
  },
  
  // ============================================
  // ADDITIONAL INFO
  // ============================================
  technicianNotes: {
    type: String
  },
  customerFeedback: {
    rating: { type: Number, min: 1, max: 5 },
    comment: String,
    date: Date
  },
  cancellationReason: {
    type: String
  },
  cancelledAt: {
    type: Date
  },
  
  // Status history for tracking
  statusHistory: [{
    status: String,
    timestamp: Date,
    note: String
  }],
  
  // ============================================
  // METADATA
  // ============================================
  platform: {
    type: String,
    enum: ['web', 'android', 'ios'],
    default: 'web'
  },
  language: {
    type: String,
    enum: ['en', 'ur'],
    default: 'en'
  },
  
  // Legacy location field (for backward compatibility)
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [0, 0]
    }
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// ============================================
// INDEXES
// ============================================
bookingSchema.index({ location: '2dsphere' });
bookingSchema.index({ bookingId: 1 });
bookingSchema.index({ orderNumber: 1 });
bookingSchema.index({ phone: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ createdAt: -1 });

// ============================================
// PRE-SAVE MIDDLEWARE
// ============================================
bookingSchema.pre('save', function(next) {
  // Generate order number if new booking
  if (this.isNew && !this.orderNumber) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 9000) + 1000;
    this.orderNumber = `ORD-${year}${month}${day}-${random}`;
  }
  
  // Convert date/time to scheduledDate if not set
  if (this.date && this.time && !this.scheduledDate) {
    this.scheduledDate = new Date(this.date);
    this.scheduledTime = this.time;
  }
  
  // Set location coordinates from coordinates object
  if (this.coordinates && this.coordinates.latitude && this.coordinates.longitude) {
    this.location = {
      type: 'Point',
      coordinates: [this.coordinates.longitude, this.coordinates.latitude]
    };
  }
  
  // Extract service details if service is an object
  if (this.service && typeof this.service === 'object' && !mongoose.Types.ObjectId.isValid(this.service)) {
    this.serviceDetails = {
      name: this.service.titleKey || this.service.name || 'AC Service',
      icon: this.service.icon || '❄️',
      price: this.service.basePrice || 0,
      category: this.service.category || 'general'
    };
    
    // Set pricing from service
    if (!this.servicePrice) {
      this.servicePrice = this.service.basePrice || 0;
    }
    if (!this.estimatedCost) {
      this.estimatedCost = this.service.basePrice || 0;
    }
  }
  
  next();
});

// ============================================
// METHODS
// ============================================
bookingSchema.methods.toJSON = function() {
  const booking = this.toObject();
  
  // Clean up for frontend
  delete booking.__v;
  
  return booking;
};

module.exports = mongoose.model('Booking', bookingSchema);