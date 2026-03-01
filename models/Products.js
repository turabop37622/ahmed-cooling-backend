// backend/models/Product.js

const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  categoryId: {
    type: String,
    enum: ['ac', 'led', 'fridge', 'washing'],
    required: true,
    index: true,
  },
  brand: {
    type: String,
    required: true,
    index: true,
  },
  model: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    default: '',
  },
  variants: {
    type: [String],
    default: [],
  },

  // ── Cloudinary image fields ──────────────────────────────
  imageUrl: {
    type: String,
    default: '',
  },
  imagePublicId: {       // delete ke liye zaroori
    type: String,
    default: '',
  },
  // ────────────────────────────────────────────────────────

}, { timestamps: true });

module.exports = mongoose.model('Product', ProductSchema);