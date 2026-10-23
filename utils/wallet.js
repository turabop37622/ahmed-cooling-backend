// Technician prepaid wallet. The balance is the sum of the technician's WalletTransaction lines; a booking's
// commission is set aside ("held") when the technician picks it up and settled when the job is completed, or given
// back if the booking is cancelled/taken over. Only used while dispatch offer mode is on (utils/dispatch.js).
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const WalletTransaction = require('../models/WalletTransaction');
const { getCommissionRate, computeCommission, round2 } = require('./commission');

const toId = (v) => (v instanceof mongoose.Types.ObjectId ? v : new mongoose.Types.ObjectId(String(v)));

// Map<technicianId string, balance> for the given technicians (missing = 0).
const balances = async (ids) => {
  const rows = await WalletTransaction.aggregate([
    { $match: { technician: { $in: ids.map(toId) } } },
    { $group: { _id: '$technician', balance: { $sum: '$amount' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), round2(r.balance)]));
};

const balanceOf = async (id) => (await balances([id])).get(String(id)) || 0;

const record = (line) => WalletTransaction.create(line);

// { rate, amount } — the commission that would be held for this booking right now (on the booking total).
const holdFor = async (booking) => {
  const { rate, amount } = computeCommission(booking.totalAmount, await getCommissionRate());
  return { rate, amount };
};

// Sets the commission aside from the technician's wallet and remembers it on the booking.
const createHold = async (booking, technicianId, { createdBy } = {}) => {
  const { rate, amount } = await holdFor(booking);
  await Booking.updateOne(
    { _id: booking._id },
    { $set: { commissionHold: { technician: technicianId, amount, rate, status: 'held', at: new Date() } } }
  );
  if (amount > 0) {
    await record({
      technician: technicianId, type: 'hold', amount: -amount, booking: booking._id,
      note: `Commission held for booking #${booking.orderNumber || booking._id}`, createdBy,
    });
  }
  return { rate, amount };
};

// Gives a held (or under-review) commission back to the technician. Atomic: only the first caller gets it back.
// `type` is 'release' (booking cancelled / taken over) or 'refund' (the admin returned a cancelled booking's hold).
const releaseHold = async (booking, { type = 'release', note, createdBy, allowStatuses = ['held', 'review'], technicianId } = {}) => {
  const filter = { _id: booking._id, 'commissionHold.status': { $in: allowStatuses } };
  if (technicianId) filter['commissionHold.technician'] = technicianId;
  const claimed = await Booking.findOneAndUpdate(filter, { $set: { 'commissionHold.status': 'released' } }, { new: false });
  if (!claimed || !claimed.commissionHold) return 0;
  const { amount, technician } = claimed.commissionHold;
  if (amount > 0) {
    await record({
      technician, type, amount, booking: booking._id,
      note: note || `Commission returned for booking #${booking.orderNumber || booking._id}`, createdBy,
    });
  }
  return amount || 0;
};

// The company keeps a hold (admin decision after a technician cancelled).
const forfeitHold = async (booking) => {
  const claimed = await Booking.findOneAndUpdate(
    { _id: booking._id, 'commissionHold.status': { $in: ['held', 'review'] } },
    { $set: { 'commissionHold.status': 'forfeited' } },
    { new: false }
  );
  return claimed && claimed.commissionHold ? claimed.commissionHold.amount || 0 : 0;
};

// On completion the real commission (on the amount collected) replaces the hold; the difference is paid out of / into
// the wallet. Does nothing when no hold is outstanding for this technician.
const settleOnCompletion = async (booking) => {
  const hold = booking.commissionHold;
  if (!hold || hold.status !== 'held' || !booking.commission || booking.commission.amount === undefined) return 0;
  const claimed = await Booking.findOneAndUpdate(
    { _id: booking._id, 'commissionHold.status': 'held' },
    { $set: { 'commissionHold.status': 'settled' } },
    { new: false }
  );
  if (!claimed) return 0;
  const diff = round2((hold.amount || 0) - (booking.commission.amount || 0));
  if (diff !== 0) {
    await record({
      technician: hold.technician, type: 'adjust', amount: diff, booking: booking._id,
      note: `Commission adjusted to the amount collected on #${booking.orderNumber || booking._id}`,
    });
  }
  return diff;
};

module.exports = { balances, balanceOf, record, holdFor, createHold, releaseHold, forfeitHold, settleOnCompletion };
