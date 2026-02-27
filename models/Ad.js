// backend/models/Ad.js
// ✅ Professional level — userId properly ref kiya User model se

const mongoose = require('mongoose');

const AdSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',   // ✅ Population ke liye zaroori
    required: true,
  },
  categoryId: {
    type: String,
    enum: ['ac', 'led', 'fridge', 'washing'],
    required: true,
  },
  categoryLabel: { type: String },
  brand:        { type: String, required: true },
  model:        { type: String, required: true },
  variant:      { type: String },
  variantLabel: { type: String },
  condition: {
    type: String,
    enum: ['new', 'like_new', 'good', 'fair', 'for_parts'],
    required: true,
  },
  price:       { type: Number, required: true },
  description: { type: String, default: '' },
  location:    { type: String, required: true },
  phone:       { type: String, required: true },
  images:      { type: [String], default: [] },
  status: {
    type: String,
    enum: ['pending', 'active', 'rejected', 'expired'],
    default: 'pending',
  },
  rejectReason: { type: String, default: '' },
  views:        { type: Number, default: 0 },
  calls:        { type: Number, default: 0 },
  featured:     { type: Boolean, default: false },
  expiryDate:   { type: Date, default: null },

  // ✅ NEW: Report count
  reports:      { type: Number, default: 0 },

}, { timestamps: true });

// ✅ Index for faster queries
AdSchema.index({ status: 1, createdAt: -1 });
AdSchema.index({ userId: 1, status: 1 });
AdSchema.index({ categoryId: 1, status: 1 });

module.exports = mongoose.model('Ad', AdSchema);