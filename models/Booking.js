    const mongoose = require('mongoose');
    const crypto = require('crypto');
    const { riyadhCompactDate } = require('../utils/schedule');

    // true for a plain embedded service object, false for an ObjectId / string id / nothing.
    const isEmbeddedService = (service) =>
      !!service && typeof service === 'object' && !(service instanceof mongoose.Types.ObjectId) &&
      service._bsontype !== 'ObjectId' && !Array.isArray(service);

    const bookingSchema = new mongoose.Schema({
      // Unique identifiers
      bookingId: {
        type: String,
        unique: true,
        sparse: true
      },
      orderNumber: {
        type: String,
        required: true,
        unique: true
      },
      
      // ============================================
      // ✅ USER REFERENCES - ZAROORI FIELD
      // ============================================
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false   // Optional guest bookings ke liye (indexed by { user, createdAt } below)
      },
      
      // ============================================
      // SERVICE (Can be ObjectId OR embedded object)
      // ============================================
      service: {
        type: mongoose.Schema.Types.Mixed,
        required: false
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
        required: false
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
        required: false
      },
      scheduledTime: {
        type: String,
        required: false
      },
      
      // Public booking fields (from frontend)
      date: {
        type: String  // "2026-02-16" format
      },
      time: {
        type: String  // "06:00 PM" format
      },
      
      // ============================================
      // LOCATION & COUNTRY
      // ============================================
      // Saudi Arabia / SAR only. The other enum values stay ONLY so that old documents (legacy +92 / PKR test
      // bookings) can still be loaded and re-saved until scripts/migrations/backfill-booking-country.js has archived
      // them; a NEW booking can only be Saudi Arabia / SAR (validators below).
      country: {
        type: String,
        enum: ['Saudi Arabia', 'Qatar', 'Pakistan', 'Other'],
        default: 'Saudi Arabia',
        validate: {
          validator: function (v) { return !this.isNew || v === 'Saudi Arabia'; },
          message: 'Bookings are only available in Saudi Arabia'
        }
      },
      city: {
        type: String,
        default: ''
      },
      currency: {
        type: String,
        enum: ['SAR', 'QAR', 'PKR'],
        default: 'SAR',
        validate: {
          validator: function (v) { return !this.isNew || v === 'SAR'; },
          message: 'Bookings are priced in SAR'
        }
      },
      address: {
        type: String,
        required: true
      },
      phone: {
        type: String,
        required: true   // indexed below (phone search)
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
        default: 'pending'   // indexed below together with date/time and createdAt
      },
      priority: {
        type: String,
        enum: ['normal', 'emergency'],
        default: 'normal'
      },
      
      // Pricing
      estimatedCost: {
        type: Number,
        required: false,
        default: 0
      },
      servicePrice: {
        type: Number,
        default: 0
      },
      visitCharges: {
        type: Number,
        default: 30
      },
      // Optional client-supplied key that makes create requests safe to retry (see routes/bookings.js)
      idempotencyKey: {
        type: String
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
        name: String,
        date: Date,
        approved: { type: Boolean, default: false }
      },
      // Set when the appointment is moved (admin sees the old slot too)
      rescheduledAt: { type: Date },
      rescheduledBy: { type: String, enum: ['customer', 'admin'] },
      previousSchedule: { date: String, time: String },
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
        note: String,
        actorRole: String,   // 'admin' | 'technician' | 'customer'
        actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
      }],

      // One-time secret for the confirm/cancel links in the admin email (cleared when a link is used).
      // Never sent to clients (removed in toJSON below).
      emailActionNonce: {
        type: String
      },

      // Soft delete (admin): hidden from every customer and admin list, kept for the records.
      deletedAt: { type: Date },
      deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      
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
        enum: ['en', 'ur', 'ar'],
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
    // INDEXES - FAST QUERIES KE LIYE
    // ============================================
    // Each index is declared exactly once (bookingId / orderNumber are unique on the fields above).
    // scripts/migrations/booking-indexes.js drops the old duplicates (user_1, status_1, createdAt_1, country_1, city_1).
    bookingSchema.index({ location: '2dsphere' });
    bookingSchema.index({ phone: 1 });
    bookingSchema.index({ email: 1 });
    bookingSchema.index({ createdAt: -1 });
    // A customer's bookings, newest first
    bookingSchema.index({ user: 1, createdAt: -1 });
    // Admin lists: by status + schedule, by status + newest, emergencies
    bookingSchema.index({ status: 1, date: 1, time: 1 });
    bookingSchema.index({ status: 1, createdAt: -1 });
    bookingSchema.index({ priority: 1, status: 1 });
    // Reviews (public + admin), newest first
    bookingSchema.index({ 'customerFeedback.approved': 1, 'customerFeedback.date': -1 });
    bookingSchema.index({ deletedAt: 1 });
    // Unique per user, but only for bookings that carry a key (a plain sparse index would still index every booking via "user").
    bookingSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });

    // ============================================
    // PRE-SAVE MIDDLEWARE
    // ============================================
    // Generate order number if new booking. Runs before validation (orderNumber is required).
    // The date part is the Saudi date, not the server's UTC date.
    bookingSchema.pre('validate', function(next) {
      if (this.isNew && !this.orderNumber) {
        const random = crypto.randomBytes(4).toString('hex').toUpperCase();
        this.orderNumber = `ORD-${riyadhCompactDate()}-${random}`;
      }
      next();
    });

    bookingSchema.pre('save', function(next) {
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
      
      // Extract service details if service is an embedded object ({ id, name, ... }). A bare ObjectId (legacy) has
      // no details to copy. ObjectId.isValid() must NOT be used here: it also returns true for { id: '<24 hex>' }.
      const embedded = isEmbeddedService(this.service);
      if (embedded && (this.isNew || this.isModified('service') || !this.serviceDetails || !this.serviceDetails.name)) {
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
      delete booking.__v;
      delete booking.emailActionNonce;
      return booking;
    };

    module.exports = mongoose.model('Booking', bookingSchema);