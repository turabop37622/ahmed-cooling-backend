const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Service name is required'],
    trim: true
  },
  nameAr: {
    type: String,
    required: [true, 'Arabic service name is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Description is required']
  },
  descriptionAr: {
    type: String,
    required: [true, 'Arabic description is required']
  },
  icon: {
    type: String,
    default: '🔧'
  },
  basePrice: {
    type: Number,
    required: [true, 'Base price is required'],
    min: [0, 'Price cannot be negative']
  },
  category: {
    type: String,
    enum: ['ac', 'refrigerator', 'washing-machine', 'stove', 'general'],
    required: true
  },
  isPopular: {
    type: Boolean,
    default: false
  },
  isEmergency: {
    type: Boolean,
    default: false
  },
  estimatedDuration: {
    type: String,
    default: '2-3 hours'
  },
  warrantyDays: {
    type: Number,
    default: 30
  },
  images: [{
    type: String
  }],
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

module.exports = mongoose.model('Service', serviceSchema);