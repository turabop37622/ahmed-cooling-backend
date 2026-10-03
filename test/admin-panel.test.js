require('./helpers/quiet');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

process.env.JWT_SECRET = 'test-only-secret-for-admin-panel-tests';

const User = require('../models/User');
const Booking = require('../models/Booking');
const AuditLog = require('../models/AuditLog');
const adminRouter = require('../routes/admin');
const { rejectMongoOperators } = require('../utils/security');

const { helpers } = adminRouter;
const ADMIN = '507f1f77bcf86cd799439051';
const BOOKING = '507f1f77bcf86cd799439052';

// A query stand-in: every chain method returns itself and awaiting it yields `value`.
const chain = (value) => {
  const q = {};
  for (const m of ['select', 'lean', 'populate', 'sort', 'skip', 'limit']) q[m] = () => q;
  q.then = (resolve, reject) => Promise.resolve(typeof value === 'function' ? value() : value).then(resolve, reject);
  return q;
};

let admin; let audits; let booking; let lastUpdate; let lastPipeline;
const saved = {};
let server; let base;
test.before(async () => {
  Object.assign(saved, {
    findById: User.findById, bFindOne: Booking.findOne, bFoau: Booking.findOneAndUpdate, bUpdateOne: Booking.updateOne,
    bAggregate: Booking.aggregate, audit: AuditLog.create,
  });
  User.findById = (id) => chain(String(id) === ADMIN ? admin : null);
  Booking.findOne = (filter) => chain(() => {
    if (!booking) return null;
    if (filter._id && String(filter._id) !== String(booking._id)) return null;
    if ('deletedAt' in filter && booking.deletedAt) return null;
    if (filter['customerFeedback.rating'] && !booking.customerFeedback?.rating) return null;
    return { ...booking };
  });
  Booking.findOneAndUpdate = (filter, update) => chain(() => {
    lastUpdate = { filter, update };
    if (!booking || booking.deletedAt || !filter.status.$in.includes(booking.status)) return null;
    Object.assign(booking, update.$set);
    return { ...booking };
  });
  Booking.updateOne = async (filter, update) => { lastUpdate = { filter, update }; return { acknowledged: true }; };
  Booking.aggregate = async (pipeline) => { lastPipeline = pipeline; return [{ byStatus: [], emergency: [], total: [], rows: [] }]; };
  AuditLog.create = async (entry) => { audits.push(entry); return entry; };

  const app = express();
  app.use(express.json());
  app.use(rejectMongoOperators);
  app.use('/api/admin', adminRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/admin`;
});
test.after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  User.findById = saved.findById; Booking.findOne = saved.bFindOne; Booking.findOneAndUpdate = saved.bFoau;
  Booking.updateOne = saved.bUpdateOne; Booking.aggregate = saved.bAggregate; AuditLog.create = saved.audit;
});
test.beforeEach(() => {
  audits = []; lastUpdate = null; lastPipeline = null; booking = null;
  admin = {
    _id: ADMIN, role: 'admin', isVerified: true, password: bcrypt.hashSync('CurrentAdminPass1', 4),
    comparePassword: async function (p) { return bcrypt.compare(p, this.password); },
    save: async function () { this.saved = true; return this; },
  };
});

const call = async (method, path, body) => {
  const token = jwt.sign({ id: ADMIN, role: 'admin' }, process.env.JWT_SECRET);
  const res = await fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

test('change-password: wrong current password is a 400 (session stays valid); length is 12-72', async () => {
  const wrong = await call('POST', '/change-password', { currentPassword: 'not-it', newPassword: 'BrandNewAdminPass1' });
  assert.equal(wrong.status, 400);
  assert.match(wrong.json.message, /incorrect/i);
  assert.equal((await call('POST', '/change-password', { currentPassword: 'CurrentAdminPass1', newPassword: 'short' })).status, 400);
  assert.equal((await call('POST', '/change-password', { currentPassword: 'CurrentAdminPass1', newPassword: 'x'.repeat(73) })).status, 400);
  assert.equal(admin.saved, undefined, 'nothing saved on a refused change');
  const ok = await call('POST', '/change-password', { currentPassword: 'CurrentAdminPass1', newPassword: 'BrandNewAdminPass1' });
  assert.equal(ok.status, 200);
  assert.equal(admin.saved, true);
  assert.equal(admin.password, 'BrandNewAdminPass1', 'the model pre-save hook hashes it and revokes older tokens');
});

test('bookings search: regex characters are escaped and phone numbers match in any common format', () => {
  const search = helpers.buildBookingSearch('  a.*(b  ');
  const rx = search.$or.find((c) => c.customerName).customerName;
  assert.equal(rx.source, 'a\\.\\*\\(b');
  assert.equal(rx.flags, 'i');
  assert.ok(rx.test('xA.*(B') && !rx.test('aXXb'), 'matches literally, case-insensitively');
  for (const field of ['phone', 'email', 'orderNumber', 'bookingId', 'address', 'serviceDetails.name', 'service.name', 'service.name_ar']) {
    assert.ok(search.$or.some((c) => c[field]), `searches ${field}`);
  }
  for (const typed of ['0501110001', '966501110001', '+966501110001', '+966 50 111 0001', '00966501110001']) {
    assert.equal(helpers.phoneSearchDigits(typed), '501110001', typed);
  }
  const phoneRx = helpers.buildBookingSearch('0501110001').$or.filter((c) => c.phone).map((c) => c.phone);
  assert.ok(phoneRx.some((r) => r.test('+966501110001')), 'local format finds the stored international number');
  assert.equal(helpers.phoneSearchDigits('Ahmed'), null);
  assert.equal(helpers.buildBookingSearch('   '), null);
});

test('bookings query: validation, limit cap, deleted bookings excluded, status/priority filters', async () => {
  const p = helpers.parseBookingsQuery({ page: '2', limit: '100000', status: 'active', priority: 'emergency', q: 'x', from: '2026-10-01', to: '2026-10-31', sort: '-created' });
  assert.equal(p.limit, 100);
  assert.equal(p.skip, 100);
  assert.deepEqual(p.listMatch.status, { $in: ['pending', 'confirmed', 'assigned', 'on_the_way', 'in_progress'] });
  assert.equal(p.listMatch.priority, 'emergency');
  assert.equal(p.baseMatch.deletedAt, null);
  assert.deepEqual(p.dateMatch, { _dateKey: { $gte: '2026-10-01', $lte: '2026-10-31' } });
  assert.ok(helpers.parseBookingsQuery({ status: 'bogus' }).error);
  assert.ok(helpers.parseBookingsQuery({ from: '01/10/2026' }).error);
  assert.ok(helpers.parseBookingsQuery({ sort: 'price' }).error);
  assert.ok(helpers.parseBookingsQuery({ status: ['a', 'b'] }).error);
  assert.equal(helpers.parseBookingsQuery({}).sort, 'schedule');

  assert.equal((await call('GET', '/bookings?status=bogus')).status, 400);
  const res = await call('GET', '/bookings?limit=5000&q=a%2Bb');
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.json.counts).sort(), ['active', 'all', 'assigned', 'cancelled', 'completed', 'confirmed', 'emergency', 'in_progress', 'on_the_way', 'pending']);
  assert.equal(res.json.page, 1);
  assert.equal(lastPipeline[0].$match.deletedAt, null);
  const rows = lastPipeline.at(-1).$facet.rows;
  assert.equal(rows.find((s) => s.$limit).$limit, 100);
  assert.ok(rows.find((s) => s.$project), 'list returns selected fields only');
});

test('stats: Riyadh day boundaries, SAR-only revenue, deleted bookings excluded, roles split', () => {
  // 22:30 UTC is already the next day in Riyadh (UTC+3).
  assert.deepEqual(helpers.riyadhNow(new Date('2026-10-03T22:30:00Z')), { date: '2026-10-04', minutes: 90 });
  const pipeline = helpers.buildStatsPipeline({ date: '2026-10-04', minutes: 600 });
  assert.equal(pipeline[0].$match.deletedAt, null);
  const facet = pipeline.at(-1).$facet;
  assert.deepEqual(facet.revenue[0].$match, { status: 'completed', currency: { $in: ['SAR', null] } });
  assert.equal(facet.todayJobs[0].$match._dateKey, '2026-10-04');
  const [late, todayLate] = facet.overdue[0].$match.$or;
  assert.deepEqual(late._dateKey, { $lt: '2026-10-04' });
  assert.deepEqual(todayLate._timeMin, { $lt: 600 });

  const shaped = helpers.shapeStats({
    bookings: {
      byStatus: [{ _id: 'pending', n: 2 }, { _id: 'completed', n: 3 }],
      todayJobs: [{ n: 4 }], overdue: [{ n: 1 }], emergencies: [], unassigned: [{ n: 2 }],
      revenue: [{ completed: 2650, paid: 2170 }],
      reviews: [{ average: 3.666666, count: 3, pending: 1 }],
    },
    roles: [{ _id: 'customer', n: 8 }, { _id: 'technician', n: 2 }, { _id: 'admin', n: 1 }],
    services: [{ _id: true, n: 19 }, { _id: false, n: 2 }],
    newInquiries: 4,
  });
  assert.equal(shaped.byStatus.all, 5);
  assert.equal(shaped.byStatus.cancelled, 0);
  assert.deepEqual(shaped.today, { jobs: 4, overdue: 1, emergencies: 0, unassigned: 2 });
  assert.deepEqual(shaped.revenue, { completedSAR: 2650, paidSAR: 2170 });
  assert.deepEqual(shaped.users, { customers: 8, technicians: 2, admins: 1 });
  assert.deepEqual(shaped.services, { active: 19, inactive: 2 });
  assert.deepEqual(shaped.reviews, { average: 3.67, count: 3, pending: 1 });
  assert.deepEqual(shaped.inquiries, { new: 4 });
  assert.equal(helpers.shapeStats({}).reviews.average, null, 'no reviews means no average, not 0 or 5');
});

test('stats: unassigned counts only confirmed bookings without a technician; overdue uses the shared helper', () => {
  const now = { date: '2026-10-04', minutes: 600 };
  const facet = helpers.buildStatsPipeline(now).at(-1).$facet;
  assert.deepEqual(facet.unassigned[0].$match, { status: 'confirmed', technician: null });
  assert.deepEqual(facet.overdue[0].$match, helpers.overdueMatch(now));
});

test('bookings list: unassigned/overdue filters validate, narrow the counted base set and match the stats', async () => {
  for (const v of ['1', 'true']) {
    const p = helpers.parseBookingsQuery({ unassigned: v, overdue: v });
    assert.equal(p.error, undefined, v);
    assert.equal(p.unassigned, true);
    assert.equal(p.overdue, true);
    assert.equal(p.baseMatch.technician, null);
  }
  const off = helpers.parseBookingsQuery({ unassigned: '', overdue: undefined });
  assert.equal(off.unassigned, false);
  assert.equal(off.overdue, false);
  assert.ok(!('technician' in off.baseMatch));
  for (const bad of ['0', 'yes', 'TRUE ', ['1', '1'], { $ne: 1 }]) {
    assert.ok(helpers.parseBookingsQuery({ unassigned: bad }).error, `unassigned=${JSON.stringify(bad)}`);
    assert.ok(helpers.parseBookingsQuery({ overdue: bad }).error, `overdue=${JSON.stringify(bad)}`);
  }
  assert.equal((await call('GET', '/bookings?unassigned=yes')).status, 400);
  assert.equal((await call('GET', '/bookings?overdue=0')).status, 400);

  // The same overdue condition as the dashboard, applied before the $facet so counts agree with the total.
  const now = { date: '2026-10-04', minutes: 600 };
  const pipeline = helpers.buildBookingsPipeline(helpers.parseBookingsQuery({ overdue: '1', unassigned: '1' }), now);
  const facetAt = pipeline.findIndex((s) => s.$facet);
  const overdueStage = pipeline.slice(0, facetAt).find((s) => s.$match && s.$match.$or);
  assert.deepEqual(overdueStage.$match, helpers.overdueMatch(now));
  assert.deepEqual(overdueStage.$match, helpers.buildStatsPipeline(now).at(-1).$facet.overdue[0].$match);
  assert.equal(pipeline[0].$match.technician, null, 'unassigned narrows the base match');
  assert.equal(pipeline[0].$match.deletedAt, null);

  // Combined with a date range: both apply.
  const ranged = helpers.buildBookingsPipeline(helpers.parseBookingsQuery({ overdue: 'true', from: '2026-09-01' }), now);
  const and = ranged.find((s) => s.$match && s.$match.$and).$match.$and;
  assert.deepEqual(and, [{ _dateKey: { $gte: '2026-09-01' } }, helpers.overdueMatch(now)]);

  // Through the route, with a status: the status stays a list filter, overdue goes into the base set.
  const res = await call('GET', '/bookings?status=active&overdue=1');
  assert.equal(res.status, 200);
  const facetIdx = lastPipeline.findIndex((s) => s.$facet);
  assert.ok(lastPipeline.slice(0, facetIdx).some((s) => s.$match && s.$match.$or), 'overdue applied before counts');
  assert.ok(!lastPipeline.slice(0, facetIdx).some((s) => s.$match && s.$match.technician === null), 'no unassigned filter unless asked');
});

test('delete: only pending/cancelled, soft (deletedAt/deletedBy), idempotent, audited', async () => {
  booking = { _id: BOOKING, bookingId: 'BK-1', status: 'confirmed', totalAmount: 180, currency: 'SAR' };
  const refused = await call('DELETE', `/bookings/${BOOKING}`);
  assert.equal(refused.status, 409);
  assert.equal(refused.json.message, 'Cancel the booking first');
  assert.equal(lastUpdate, null);

  booking.status = 'cancelled';
  const ok = await call('DELETE', `/bookings/${BOOKING}`);
  assert.equal(ok.status, 200);
  assert.ok(booking.deletedAt instanceof Date);
  assert.equal(String(booking.deletedBy), ADMIN);
  assert.deepEqual(lastUpdate.filter.status, { $in: ['pending', 'cancelled'] });
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'booking.delete');
  assert.equal(audits[0].target.label, 'BK-1');

  const again = await call('DELETE', `/bookings/${BOOKING}`);
  assert.equal(again.status, 200, 'deleting twice is not an error');
  assert.equal(audits.length, 1, 'and is not audited twice');

  assert.equal((await call('DELETE', '/bookings/507f1f77bcf86cd799439099')).status, 404);
  assert.deepEqual(helpers.deleteDecision({ status: 'pending' }), null);
  assert.equal(helpers.deleteDecision({ status: 'in_progress' }).status, 409);
});

test('review approve needs a real boolean', async () => {
  booking = { _id: BOOKING, bookingId: 'BK-2', status: 'completed', customerFeedback: { rating: 4, approved: false } };
  for (const approved of [undefined, 'true', 1, null, 'yes']) {
    const res = await call('PUT', `/reviews/${BOOKING}/approve`, approved === undefined ? {} : { approved });
    assert.equal(res.status, 400, `approved=${JSON.stringify(approved)}`);
  }
  assert.equal(lastUpdate, null);
  const ok = await call('PUT', `/reviews/${BOOKING}/approve`, { approved: true });
  assert.equal(ok.status, 200);
  assert.deepEqual(lastUpdate.update, { $set: { 'customerFeedback.approved': true } });
  assert.equal(audits[0].action, 'review.approve');
  assert.equal((await call('PUT', '/reviews/not-an-id/approve', { approved: false })).status, 404);
});

test('payment: only known statuses/methods are accepted', async () => {
  booking = { _id: BOOKING, bookingId: 'BK-3', status: 'completed', paymentStatus: 'pending' };
  assert.equal((await call('PATCH', `/bookings/${BOOKING}/payment`, { paymentStatus: 'refunded' })).status, 400);
  assert.equal((await call('PATCH', `/bookings/${BOOKING}/payment`, { paymentStatus: 'paid', paymentMethod: 'bitcoin' })).status, 400);
});
