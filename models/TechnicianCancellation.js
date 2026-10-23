const mongoose = require('mongoose');

// A technician giving a booking back after picking it up. The reason is mandatory; the admin then decides what
// happens to the commission that was held for that booking:
//   pending   -> waiting for the admin
//   refunded  -> the hold went back into the wallet
//   deferred  -> kept for `deferUntil` (one week by default), then refunded automatically unless the admin forfeits it
//   forfeited -> the company keeps it
const technicianCancellationSchema = new mongoose.Schema({
  technician: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  orderNumber: { type: String },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  holdAmount: { type: Number, default: 0 },
  reviewStatus: { type: String, enum: ['pending', 'refunded', 'deferred', 'forfeited'], default: 'pending', index: true },
  deferUntil: { type: Date },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  decidedAt: { type: Date },
  adminNote: { type: String, trim: true, maxlength: 500, default: '' },
  // Set when this cancellation was the one that froze the account.
  causedFreeze: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

technicianCancellationSchema.index({ technician: 1, createdAt: -1 });

module.exports = mongoose.models.TechnicianCancellation || mongoose.model('TechnicianCancellation', technicianCancellationSchema);
