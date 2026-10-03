const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Service name is required'],
    trim: true,
    minlength: [2, 'Service name must be 2-120 characters'],
    maxlength: [120, 'Service name must be 2-120 characters']
  },
  // URL slug (e.g. "ac-repair-jeddah"). Set once on create (utils/slug.js, same rules as web/src/lib/serviceSlugs.js)
  // and never changed by a rename, so published links keep working.
  slug: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
    match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug']
  },
  nameAr: {
    type: String,
    required: [true, 'Arabic service name is required'],
    trim: true,
    minlength: [2, 'Arabic service name must be 2-120 characters'],
    maxlength: [120, 'Arabic service name must be 2-120 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [2000, 'Description must be at most 2000 characters']
  },
  descriptionAr: {
    type: String,
    required: [true, 'Arabic description is required'],
    maxlength: [2000, 'Arabic description must be at most 2000 characters']
  },
  icon: {
    type: String,
    default: '🔧'
  },
  basePrice: {
    type: Number,
    required: [true, 'Base price is required'],
    min: [0, 'Price cannot be negative'],
    max: [100000, 'Price cannot exceed 100000'],
    validate: { validator: Number.isFinite, message: 'Price must be a finite number' }
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
    default: 30,
    min: [0, 'Warranty cannot be negative'],
    max: [3650, 'Warranty cannot exceed 3650 days']
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