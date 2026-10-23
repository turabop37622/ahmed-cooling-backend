const mongoose = require('mongoose');

// One line in a technician's prepaid wallet. `amount` is signed (+ adds to the balance, - takes from it):
//   topup    +  the admin recorded money the technician paid in
//   hold     -  the company commission set aside when the technician picks up a booking
//   release  +  a hold given back (booking cancelled by the customer/admin, or taken over because of lateness)
//   refund   +  the admin returned the hold of a booking the technician cancelled
//   adjust   +/- the hold differs from the commission on what was really collected, or a manual correction
//   opening  +/- balance carried over from the old "commission owed" ledger when the wallet was switched on
// The balance is the sum of the technician's lines (utils/wallet.js), so nothing can drift out of sync.
const walletTransactionSchema = new mongoose.Schema({
  technician: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['topup', 'hold', 'release', 'refund', 'adjust', 'opening'], required: true },
  amount: {
    type: Number,
    required: true,
    validate: { validator: (v) => Number.isFinite(v) && v !== 0, message: 'Amount must be a non-zero number' },
  },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  method: { type: String, enum: ['cash', 'bank_transfer', 'other'] },
  note: { type: String, trim: true, maxlength: 500, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

walletTransactionSchema.index({ technician: 1, createdAt: -1 });
walletTransactionSchema.index({ booking: 1, type: 1 });

module.exports = mongoose.models.WalletTransaction || mongoose.model('WalletTransaction', walletTransactionSchema);
