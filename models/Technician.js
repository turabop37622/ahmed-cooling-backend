const mongoose = require('mongoose');

const technicianSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  // Specialties (API name: "specialties"). Values match Service.category; 'freezer'/'electronics' are legacy values
  // kept valid for old profiles. Empty = all services.
  skills: [{
    type: String,
    enum: ['ac', 'refrigerator', 'washing-machine', 'stove', 'general', 'freezer', 'electronics']
  }],
  // Cities the technician covers ('jeddah' | 'makkah'). Empty = any city (and bookings whose city is unknown).
  cities: [{
    type: String,
    enum: ['jeddah', 'makkah']
  }],
  // Gets new bookings automatically (utils/autoAssign.js) while also active and available.
  autoAssign: {
    type: Boolean,
    default: false
  },
  // Frozen accounts cannot pick up bookings until frozenUntil (set automatically after too many cancellations in
  // one day, or by an admin; an admin can lift it early).
  frozenUntil: { type: Date },
  frozenReason: { type: String, default: '' },
  // Times another technician took over this one's booking because they were late.
  lateCount: { type: Number, default: 0 },
  experience: {
    type: String,
    default: ''
  },
  certifications: [{
    name: String,
    issuingAuthority: String,
    issueDate: Date,
    expiryDate: Date
  }],
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalRatings: {
    type: Number,
    default: 0
  },
  completedJobs: {
    type: Number,
    default: 0
  },
  availability: {
    type: Boolean,
    default: true
  },
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [0, 0]
    },
    lastUpdated: Date
  },
  workingHours: {
    start: { type: String, default: '09:00' },
    end: { type: String, default: '18:00' },
    days: [{ type: String, enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }]
  },
  hourlyRate: {
    type: Number,
    default: 500
  },
  emergencyRate: {
    type: Number,
    default: 1000
  },
  active: {
    type: Boolean,
    default: true
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

// Index for location-based queries
technicianSchema.index({ currentLocation: '2dsphere' });

module.exports = mongoose.model('Technician', technicianSchema);