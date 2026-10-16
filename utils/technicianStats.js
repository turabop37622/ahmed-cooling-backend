// Job / earnings / commission figures per technician, shared by the admin panel (/api/admin/technicians) and the
// technician app (/api/technician/me). "Today" and "this month" are Asia/Riyadh.
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const CommissionSettlement = require('../models/CommissionSettlement');
const { riyadhDate } = require('./schedule');
const { round2 } = require('./commission');

const RIYADH_TZ = 'Asia/Riyadh';
const WORKING_ON = ['on_the_way', 'in_progress'];

const EMPTY_STATS = Object.freeze({
  activeJobs: 0, pendingJobs: 0, completedToday: 0, completedMonth: 0, completedTotal: 0,
  revenueTotal: 0, commissionTotal: 0, commissionPaid: 0, commissionDue: 0,
  earningsToday: 0, earningsMonth: 0, activeJobId: null,
});

// Pipeline over the technicians' (non-deleted) bookings; exported for the tests.
const statsPipeline = (ids, today = riyadhDate()) => {
  const month = today.slice(0, 7);
  const done = { $eq: ['$status', 'completed'] };
  const collected = { $ifNull: ['$completion.amountCollected', { $ifNull: ['$totalAmount', 0] }] };
  const share = { $ifNull: ['$commission.technicianShare', collected] };
  return [
    { $match: { technician: { $in: ids }, deletedAt: null } },
    {
      $addFields: {
        _doneDay: {
          $dateToString: { date: { $ifNull: ['$completion.completedAt', '$updatedAt'] }, format: '%Y-%m-%d', timezone: RIYADH_TZ, onNull: '' },
        },
      },
    },
    { $addFields: { _today: { $and: [done, { $eq: ['$_doneDay', today] }] }, _month: { $and: [done, { $eq: [{ $substrBytes: ['$_doneDay', 0, 7] }, month] }] } } },
    {
      $group: {
        _id: '$technician',
        activeJobs: { $sum: { $cond: [{ $in: ['$status', WORKING_ON] }, 1, 0] } },
        activeJobId: { $max: { $cond: [{ $in: ['$status', WORKING_ON] }, '$_id', null] } },
        pendingJobs: { $sum: { $cond: [{ $eq: ['$status', 'assigned'] }, 1, 0] } },
        completedTotal: { $sum: { $cond: [done, 1, 0] } },
        completedToday: { $sum: { $cond: ['$_today', 1, 0] } },
        completedMonth: { $sum: { $cond: ['$_month', 1, 0] } },
        revenueTotal: { $sum: { $cond: [done, collected, 0] } },
        commissionTotal: { $sum: { $cond: [done, { $ifNull: ['$commission.amount', 0] }, 0] } },
        earningsToday: { $sum: { $cond: ['$_today', share, 0] } },
        earningsMonth: { $sum: { $cond: ['$_month', share, 0] } },
      },
    },
  ];
};

// Combines the booking figures with the settlements: due = commission total - paid.
const shapeStats = (row = {}, paid = 0) => {
  const commissionTotal = round2(row.commissionTotal || 0);
  const commissionPaid = round2(paid || 0);
  return {
    activeJobs: row.activeJobs || 0,
    pendingJobs: row.pendingJobs || 0,
    completedToday: row.completedToday || 0,
    completedMonth: row.completedMonth || 0,
    completedTotal: row.completedTotal || 0,
    revenueTotal: round2(row.revenueTotal || 0),
    commissionTotal,
    commissionPaid,
    commissionDue: round2(commissionTotal - commissionPaid),
    earningsToday: round2(row.earningsToday || 0),
    earningsMonth: round2(row.earningsMonth || 0),
    activeJobId: row.activeJobId ? String(row.activeJobId) : null,
  };
};

// Map(String(userId) -> stats) for the given technician user ids.
const statsFor = async (rawIds) => {
  const out = new Map();
  if (!rawIds.length) return out;
  // aggregate() does not cast: string ids must become ObjectIds.
  const ids = rawIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const [rows, paidRows] = await Promise.all([
    Booking.aggregate(statsPipeline(ids)),
    CommissionSettlement.aggregate([
      { $match: { technician: { $in: ids } } },
      { $group: { _id: '$technician', paid: { $sum: '$amount' } } },
    ]),
  ]);
  const rowOf = new Map(rows.map((r) => [String(r._id), r]));
  const paidOf = new Map(paidRows.map((r) => [String(r._id), r.paid]));
  for (const id of ids) out.set(String(id), shapeStats(rowOf.get(String(id)), paidOf.get(String(id))));
  return out;
};

module.exports = { EMPTY_STATS, statsPipeline, shapeStats, statsFor };
