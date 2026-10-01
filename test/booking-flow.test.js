require('./helpers/quiet');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');

process.env.JWT_SECRET = 'test-only-secret-for-booking-flow-tests';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.BOOKING_RATE_LIMIT = '1000'; // the real default is 10 per hour per customer

const User = require('../models/User');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const Technician = require('../models/Technician');
const router = require('../routes/bookings');

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const IDS = { customer: '507f1f77bcf86cd799439011', other: '507f1f77bcf86cd799439012', admin: '507f1f77bcf86cd799439014', tech: '507f1f77bcf86cd799439015', booking: '507f1f77bcf86cd799439016' };
const accounts = {
  [IDS.customer]: { _id: IDS.customer, role: 'customer', isVerified: true, fullName: 'Customer', email: 'c@example.com' },
  [IDS.other]: { _id: IDS.other, role: 'customer', isVerified: true, fullName: 'Other', email: 'o@example.com' },
  [IDS.admin]: { _id: IDS.admin, role: 'admin', isVerified: true, fullName: 'Admin' },
  [IDS.tech]: { _id: IDS.tech, role: 'technician', isVerified: true, fullName: 'Tech' },
};
const token = (id) => jwt.sign({ id, role: accounts[id].role }, process.env.JWT_SECRET);
const makeBooking = (over = {}) => ({
  _id: IDS.booking, bookingId: 'BKTEST', orderNumber: 'ORD-1', user: IDS.customer, status: 'pending', statusHistory: [],
  customerName: 'Customer', phone: '+966512345678', email: 'c@example.com', date: day(2), time: '10:00 AM', currency: 'SAR',
  customerFeedback: { approved: false }, // a nested object is always "there", even when empty
  service: { name: 'AC Service' }, save: async function () { return this; }, ...over,
});

let server;
let base;
let db; // the booking the mocked model returns
let emails;
const originals = {};

test.before(async () => {
  for (const [obj, name] of [[User, 'findById'], [Service, 'findOne'], [Booking, 'findOne'], [Booking, 'findById'], [Booking, 'create'], [Booking, 'findOneAndUpdate'], [Technician, 'findOne'], [Technician, 'updateOne'], [axios, 'post']]) {
    originals[`${obj.modelName || 'axios'}.${name}`] = obj[name];
  }
  originals.notificationSave = Notification.prototype.save;
  User.findById = (id) => { const u = accounts[String(id)] || null; return { select: async () => u, then: (r, j) => Promise.resolve(u).then(r, j) }; };
  User.findOne = async (filter) => Object.values(accounts).find((a) => String(a._id) === String(filter._id) && a.role === filter.role) || null;
  Notification.prototype.save = async function () { return this; };
  Technician.findOne = async () => null;
  Technician.updateOne = async () => ({});
  Booking.create = async (data) => ({ ...data, _id: 'new-id' });
  axios.post = async (url, payload) => { emails.push(payload); return { data: {} }; };

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/bookings', router);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/bookings`;
});
test.after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  User.findById = originals['User.findById'];
  Service.findOne = originals['Service.findOne'];
  Booking.findOne = originals['Booking.findOne'];
  Booking.findById = originals['Booking.findById'];
  Booking.create = originals['Booking.create'];
  Booking.findOneAndUpdate = originals['Booking.findOneAndUpdate'];
  Technician.findOne = originals['Technician.findOne'];
  Technician.updateOne = originals['Technician.updateOne'];
  axios.post = originals['axios.post'];
  Notification.prototype.save = originals.notificationSave;
});
test.beforeEach(() => {
  emails = [];
  db = makeBooking();
  Booking.findById = async () => db;
  Booking.findOne = async () => null;
  // Stand-in for the atomic review write: it only applies while no rating exists yet.
  Booking.findOneAndUpdate = async (filter, update) => {
    if (db.customerFeedback?.rating) return null;
    db.customerFeedback = update.$set.customerFeedback;
    return db;
  };
  Service.findOne = async () => ({ _id: '507f1f77bcf86cd799439013', name: 'AC Service', nameAr: 'AC', icon: '🔧', basePrice: 150, category: 'ac' });
});

const call = async (method, path, who, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${token(who)}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
};
const goodBooking = { customerName: 'Customer', phone: '+966512345678', service: '1', date: day(3), time: '10:00 AM', address: 'Jeddah, Saudi Arabia' };

test('booking dates in the past, junk dates and junk times are rejected; "Anytime" is accepted', async () => {
  for (const bad of [{ date: '2020-01-01' }, { date: 'tomorrow' }, { date: '2026-02-31' }, { time: '25:99' }, { time: 'x'.repeat(50) }]) {
    const res = await call('POST', '/public', IDS.customer, { ...goodBooking, ...bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  const ok = await call('POST', '/public', IDS.customer, { ...goodBooking, time: 'Anytime' });
  assert.equal(ok.status, 201);
});

test('customer text is HTML-escaped inside the emails sent to the admin', async () => {
  const evil = '<script>alert(1)</script><a href="https://evil.example">click</a>';
  const res = await call('POST', '/public', IDS.customer, { ...goodBooking, customerName: `Bob ${evil}`, address: evil, comments: evil });
  assert.equal(res.status, 201);
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(emails.length >= 1);
  for (const mail of emails) {
    assert.ok(!mail.htmlContent.includes('<script>'), 'script tag must be escaped');
    assert.ok(!mail.htmlContent.includes('href="https://evil.example"'), 'injected link must be escaped');
  }
  assert.ok(emails.some((m) => m.htmlContent.includes('&lt;script&gt;')));
});

test('bookings need a Saudi number and are always priced in SAR', async () => {
  for (const phone of ['+923001234567', '+97455123456']) {
    const res = await call('POST', '/public', IDS.customer, { ...goodBooking, phone });
    assert.equal(res.status, 400, phone);
  }
  let created;
  const realCreate = Booking.create;
  Booking.create = async (data) => { created = data; return { ...data, _id: 'x' }; };
  try {
    const ok = await call('POST', '/public', IDS.customer, goodBooking);
    assert.equal(ok.status, 201);
    assert.equal(created.currency, 'SAR');
    assert.equal(created.country, 'Saudi Arabia');
  } finally {
    Booking.create = realCreate;
  }
});

test('the same customer cannot book the same service and slot twice', async () => {
  Booking.findOne = async () => ({ _id: 'existing' });
  const res = await call('POST', '/public', IDS.customer, goodBooking);
  assert.equal(res.status, 409);
});

test('the old open POST /api/bookings route is gone', async () => {
  const res = await call('POST', '/', IDS.customer, { serviceId: '507f1f77bcf86cd799439013', technicianId: IDS.tech });
  assert.equal(res.status, 404);
});

test('a malformed booking id is a clean 404, not a server error', async () => {
  for (const path of ['/not-an-id', '/not-an-id/cancel', '/not-an-id/reschedule']) {
    const put = path.endsWith('cancel') || path.endsWith('reschedule');
    const res = await call(put ? 'PUT' : 'GET', path, IDS.customer, put ? {} : undefined);
    assert.equal(res.status, 404, path);
  }
});

test('reschedule validates the new date and time', async () => {
  const past = await call('PUT', `/${IDS.booking}/reschedule`, IDS.customer, { date: '2020-01-01', time: '10:00 AM' });
  assert.equal(past.status, 400);
  const ok = await call('PUT', `/${IDS.booking}/reschedule`, IDS.customer, { date: day(5), time: '11:00 AM' });
  assert.equal(ok.status, 200);
  assert.ok(db.scheduledDate instanceof Date);
  const stranger = await call('PUT', `/${IDS.booking}/reschedule`, IDS.other, { date: day(5), time: '11:00 AM' });
  assert.equal(stranger.status, 403);
});

test('feedback works once for a completed booking, validates the rating, and starts unapproved', async () => {
  db = makeBooking({ status: 'completed' });
  const badRating = await call('POST', `/${IDS.booking}/feedback`, IDS.customer, { rating: 9, comment: 'x' });
  assert.equal(badRating.status, 400);
  const stranger = await call('POST', `/${IDS.booking}/feedback`, IDS.other, { rating: 5 });
  assert.equal(stranger.status, 403);
  const ok = await call('POST', `/${IDS.booking}/feedback`, IDS.customer, { rating: 5, comment: 'Great' });
  assert.equal(ok.status, 200);
  assert.equal(db.customerFeedback.rating, 5);
  assert.equal(db.customerFeedback.approved, false);
  const again = await call('POST', `/${IDS.booking}/feedback`, IDS.customer, { rating: 4 });
  assert.equal(again.status, 400);
});

test('feedback is refused before the job is completed', async () => {
  const res = await call('POST', `/${IDS.booking}/feedback`, IDS.customer, { rating: 5 });
  assert.equal(res.status, 400);
});

test('admin email links: confirm only moves a pending booking, never a finished one, and the token is bound to the booking', async () => {
  const confirmToken = jwt.sign({ bookingId: 'BKTEST', action: 'confirm' }, process.env.JWT_SECRET);
  const postForm = (id, tok) => fetch(`${base}/admin/confirm/${id}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `token=${encodeURIComponent(tok)}`,
  }).then((r) => r.text());

  Booking.findOne = async () => db;
  db = makeBooking({ status: 'in_progress' });
  await postForm('BKTEST', confirmToken);
  assert.equal(db.status, 'in_progress');
  db = makeBooking({ status: 'completed' });
  await postForm('BKTEST', confirmToken);
  assert.equal(db.status, 'completed');

  db = makeBooking({ status: 'pending' });
  await postForm('OTHERBOOKING', confirmToken); // token belongs to a different booking
  assert.equal(db.status, 'pending');
  const cancelToken = jwt.sign({ bookingId: 'BKTEST', action: 'cancel' }, process.env.JWT_SECRET);
  await postForm('BKTEST', cancelToken); // wrong action for this URL
  assert.equal(db.status, 'pending');

  await postForm('BKTEST', confirmToken);
  assert.equal(db.status, 'confirmed');
});

test('the email confirmation page escapes anything it prints', async () => {
  Booking.findOne = async () => makeBooking({ status: 'pending', customerName: '<img src=x onerror=alert(1)>' });
  const confirmToken = jwt.sign({ bookingId: 'BKTEST', action: 'confirm' }, process.env.JWT_SECRET);
  const html = await fetch(`${base}/admin/confirm/BKTEST`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `token=${encodeURIComponent(confirmToken)}`,
  }).then((r) => r.text());
  assert.ok(!html.includes('<img src=x'), 'customer name must be escaped');
  assert.ok(html.includes('&lt;img'));
});

test('status changes: staff only, valid transitions only, assignment goes through the assign route', async () => {
  const asCustomer = await call('PUT', `/${IDS.booking}/status`, IDS.customer, { status: 'confirmed' });
  assert.equal(asCustomer.status, 403);

  const confirm = await call('PUT', `/${IDS.booking}/status`, IDS.admin, { status: 'confirmed' });
  assert.equal(confirm.status, 200);
  assert.equal(db.status, 'confirmed');

  const viaStatus = await call('PUT', `/${IDS.booking}/status`, IDS.admin, { status: 'assigned' });
  assert.equal(viaStatus.status, 400);

  const assign = await call('PUT', `/${IDS.booking}/assign`, IDS.admin, { technicianId: IDS.tech });
  assert.equal(assign.status, 200);
  assert.equal(db.status, 'assigned');
  assert.equal(String(db.technician), IDS.tech);

  const notAssigned = await call('PUT', `/${IDS.booking}/assign`, IDS.customer, { technicianId: IDS.tech });
  assert.equal(notAssigned.status, 403);

  const backwards = await call('PUT', `/${IDS.booking}/status`, IDS.admin, { status: 'pending' });
  assert.equal(backwards.status, 400);
  db.status = 'confirmed';
  const skipAhead = await call('PUT', `/${IDS.booking}/status`, IDS.admin, { status: 'in_progress' });
  assert.equal(skipAhead.status, 200, 'the admin panel\'s "In Progress" button works straight after confirming');
  db.status = 'assigned';
  const notTechnicianRole = await call('PUT', `/${IDS.booking}/assign`, IDS.admin, { technicianId: IDS.customer });
  assert.equal(notTechnicianRole.status, 404, 'only technician accounts can be assigned');

  const techMove = await call('PUT', `/${IDS.booking}/status`, IDS.tech, { status: 'on_the_way' });
  assert.equal(techMove.status, 200);
  db.technician = IDS.other;
  const wrongTech = await call('PUT', `/${IDS.booking}/status`, IDS.tech, { status: 'in_progress' });
  assert.equal(wrongTech.status, 403);
});

test('cancel: owner only, only while pending or confirmed, and the reason is length-limited', async () => {
  const stranger = await call('PUT', `/${IDS.booking}/cancel`, IDS.other, { reason: 'x' });
  assert.equal(stranger.status, 403);
  const ok = await call('PUT', `/${IDS.booking}/cancel`, IDS.customer, { reason: 'y'.repeat(5000) });
  assert.equal(ok.status, 200);
  assert.equal(db.cancellationReason.length, 500);
  const again = await call('PUT', `/${IDS.booking}/cancel`, IDS.customer, {});
  assert.equal(again.status, 400);
});

test('server errors never leak internal messages', async () => {
  Booking.findById = () => {
    const chain = { populate: () => chain, then: (resolve, reject) => Promise.reject(new Error('secret internal detail: mongodb://user:pass@host')).then(resolve, reject) };
    return chain;
  };
  const res = await call('GET', `/${IDS.booking}`, IDS.customer);
  assert.equal(res.status, 500);
  assert.ok(!res.text.includes('secret internal detail'));
});
