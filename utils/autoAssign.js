// Automatic technician assignment for new bookings (POST /api/bookings/public).
//
// Candidates: Technician profiles with autoAssign + active + availability whose User is a verified technician.
//   City: the booking city (or, when empty, its address text) mapped to 'jeddah' / 'makkah'. A technician with
//         cities only matches a booking in one of them; a booking whose city is unknown only matches technicians
//         without cities ("any city").
//   Specialty: the service category is one of the technician's specialties (no specialties = every service).
// Pick: fewest open jobs (assigned / on_the_way / in_progress) on the booking's date, then a technician with no job
//   currently on the way / in progress, then the one whose last assignment is oldest (never assigned = oldest),
//   then the lowest id (stable).
// The booking is moved pending -> assigned atomically; if anything changed meanwhile nothing happens.
const Booking = require('../models/Booking');
const Technician = require('../models/Technician');
const User = require('../models/User');

const OPEN_STATUSES = ['assigned', 'on_the_way', 'in_progress'];
const ACTIVE_STATUSES = ['on_the_way', 'in_progress'];
const CITIES = ['jeddah', 'makkah'];

// Lower-case, Arabic letter variants unified (ة->ه, أإآ->ا, ى->ي), diacritics / tatweel removed.
const normalizeText = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
  .replace(/ة/g, 'ه').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي');

// 'jeddah' | 'makkah' | null
const normalizeCity = (value) => {
  const s = normalizeText(value);
  if (!s.trim()) return null;
  if (/jedd|jidd|jeda\b|jiddah|جده|جدا\b/.test(s)) return 'jeddah';
  if (/makk|mekk|mecca|makah|macca|مكه|مكا\b/.test(s)) return 'makkah';
  return null;
};

const bookingCity = (booking) => normalizeCity(booking.city) || normalizeCity(booking.address);

const bookingCategory = (booking) => {
  const svc = booking.service && typeof booking.service === 'object' ? booking.service : {};
  return svc.category || booking.serviceDetails?.category || 'general';
};

// Does this technician profile serve this city / category?
const profileMatches = (profile, city, category) => {
  const cities = Array.isArray(profile.cities) ? profile.cities : [];
  const specialties = Array.isArray(profile.skills) ? profile.skills : [];
  const cityOk = city ? (cities.length === 0 || cities.includes(city)) : cities.length === 0;
  const specialtyOk = specialties.length === 0 || specialties.includes(category);
  return cityOk && specialtyOk;
};

// candidates: [{ userId, openJobs, hasActiveJob, lastAssignedAt }] -> the chosen one or null.
const pickTechnician = (candidates) => {
  if (!candidates.length) return null;
  const time = (d) => (d ? new Date(d).getTime() : -Infinity);
  return [...candidates].sort((a, b) =>
    (a.openJobs - b.openJobs)
    || (Number(!!a.hasActiveJob) - Number(!!b.hasActiveJob))
    || (time(a.lastAssignedAt) - time(b.lastAssignedAt))
    || String(a.userId).localeCompare(String(b.userId)))[0];
};

// Loads the candidates for a booking with their load figures (no writes).
const findCandidates = async (booking) => {
  const city = bookingCity(booking);
  const category = bookingCategory(booking);
  const profiles = await Technician.find({ autoAssign: true, active: { $ne: false }, availability: { $ne: false } })
    .select('user cities skills').lean();
  const matching = profiles.filter((p) => p.user && profileMatches(p, city, category));
  if (!matching.length) return [];
  const users = await User.find({ _id: { $in: matching.map((p) => p.user) }, role: 'technician', isVerified: true })
    .select('fullName phone').lean();
  if (!users.length) return [];
  const ids = users.map((u) => u._id);
  const dateMatch = booking.date ? booking.date : null;
  const loads = await Booking.aggregate([
    { $match: { technician: { $in: ids }, deletedAt: null } },
    {
      $group: {
        _id: '$technician',
        openJobs: { $sum: { $cond: [{ $and: [{ $in: ['$status', OPEN_STATUSES] }, { $eq: [{ $ifNull: ['$date', null] }, dateMatch] }] }, 1, 0] } },
        activeJobs: { $sum: { $cond: [{ $in: ['$status', ACTIVE_STATUSES] }, 1, 0] } },
        lastAssignedAt: { $max: '$assignedAt' },
      },
    },
  ]);
  const loadOf = new Map(loads.map((l) => [String(l._id), l]));
  return users.map((u) => {
    const l = loadOf.get(String(u._id)) || {};
    return { userId: u._id, user: u, openJobs: l.openJobs || 0, hasActiveJob: (l.activeJobs || 0) > 0, lastAssignedAt: l.lastAssignedAt || null };
  });
};

// Assigns a booking a technician. Returns { booking, technician } or null. Never throws.
// `fromStatus` lets a caller auto-assign from a status other than the usual fresh 'pending' — e.g.
// utils/whatsappBookingBot.js re-attempts this from 'confirmed' right after a customer confirms over WhatsApp,
// since a technician may have become free since the booking was first created.
const autoAssignBooking = async (booking, { fromStatus = 'pending' } = {}) => {
  try {
    if (!booking || !booking._id || booking.status !== fromStatus || booking.technician) return null;
    const chosen = pickTechnician(await findCandidates(booking));
    if (!chosen) return null;
    const now = new Date();
    const statusHistory = fromStatus === 'pending'
      ? [
          { status: 'confirmed', timestamp: now, note: 'Auto-confirmed (automatic assignment)', actorRole: 'system' },
          { status: 'assigned', timestamp: now, note: `Auto-assigned to ${chosen.user.fullName}`, actorRole: 'system' },
        ]
      : [{ status: 'assigned', timestamp: now, note: `Auto-assigned to ${chosen.user.fullName}`, actorRole: 'system' }];
    const updated = await Booking.findOneAndUpdate(
      { _id: booking._id, status: fromStatus, technician: null, deletedAt: null },
      {
        $set: { status: 'assigned', technician: chosen.userId, assignedBy: 'auto', assignedAt: now },
        $push: { statusHistory: { $each: statusHistory } },
      },
      { new: true }
    );
    return updated ? { booking: updated, technician: chosen.user } : null;
  } catch (e) {
    console.error('⚠️ Auto-assign failed (booking stays at its current status):', e.message);
    return null;
  }
};

module.exports = { OPEN_STATUSES, ACTIVE_STATUSES, CITIES, normalizeCity, bookingCity, bookingCategory, profileMatches, pickTechnician, findCandidates, autoAssignBooking };
