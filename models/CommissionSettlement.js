const mongoose = require('mongoose');

// Commission the technician paid to the company (they collect cash, the company's share is owed until recorded here).
// Balance per technician = sum(commission.amount of their completed, non-deleted bookings) - sum(settlement amounts).
const commissionSettlementSchema = new mongoose.Schema({
  technician: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: {
    type: Number,
    required: true,
    validate: { validator: (v) => Number.isFinite(v) && v > 0, message: 'Amount must be greater than 0' },
  },
  note: { type: String, trim: true, maxlength: 500, default: '' },
  method: { type: String, enum: ['cash', 'bank_transfer', 'other'], default: 'cash' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

commissionSettlementSchema.index({ technician: 1, createdAt: -1 });

module.exports = mongoose.models.CommissionSettlement || mongoose.model('CommissionSettlement', commissionSettlementSchema);
