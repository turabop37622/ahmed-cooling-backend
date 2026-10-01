const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  feedback: { type: String, trim: true, maxlength: 500, default: '' },
  name: { type: String, trim: true, maxlength: 100 },
}, { timestamps: true });

module.exports = mongoose.model('GeneralRating', ratingSchema);
