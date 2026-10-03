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
const AuditLog = require('../models/AuditLog');
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

// Minimal stand-in for MongoDB's conditional update on the one booking in `db`: the filter must match
// (equality, null = missing, $in, $exists) and then $set / $unset / $push are applied.
const valueAt = (doc, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
const matchesFilter = (doc, filter) => Object.entries(filter).every(([key, cond]) => {
  const val = valueAt(doc, key);
  if (cond === null) return val === null || val === undefined;
  if (cond && typeof cond === 'object' && !cond._bsontype) {
    if ('$in' in cond) return cond.$in.map(String).includes(String(val));
    if ('$exists' in cond) return (val !== undefined) === cond.$exists;
  }
  return String(val) === String(cond);
});
const applyUpdate = (doc, update) => {
  for (const [k, v] of Object.entries(update.$set || {})) doc[k] = v;
  for (const k of Object.keys(update.$unset || {})) delete doc[k];
  for (const [k, v] of Object.entries(update.$push || {})) (doc[k] = doc[k] || []).push(v);
};
let updates; // every conditional update that was applied
let notifications; // every in-app notification saved

let server;
let base;
let db; // the booking the mocked model returns
let emails;
let techProfile; // Technician profile returned for the assigned technician
const originals = {};

test.before(async () => {
  for (const [obj, name] of [[User, 'findById'], [Service, 'findOne'], [Booking, 'findOne'], [Booking, 'findById'], [Booking, 'create'], [Booking, 'findOneAndUpdate'], [Technician, 'findOne'], [Technician, 'updateOne'], [axios, 'post']]) {
    originals[`${obj.modelName || 'axios'}.${name}`] = obj[name];
  }
  originals.notificationSave = Notification.prototype.save;
  originals.auditRecord = AuditLog.record;
  originals.userFindOne = User.findOne;
  User.findById = (id) => { const u = accounts[String(id)] || null; return { select: async () => u, then: (r, j) => Promise.resolve(u).then(r, j) }; };
  User.findOne = async (filter) => Object.values(accounts).find((a) => String(a._id) === String(filter._id) && a.role === filter.role) || null;
  Notification.prototype.save = async function () { notifications.push(this); return this; };
  AuditLog.record = async () => {};
  Technician.findOne = async (filter) => (techProfile && String(filter.user) === IDS.tech ? techProfile : null);
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
  AuditLog.record = originals.auditRecord;
  User.findOne = originals.userFindOne;
});
test.beforeEach(() => {
  emails = [];
  updates = [];
  notifications = [];
  techProfile = { user: IDS.tech, active: true, availability: true };
  db = makeBooking();
  Booking.findById = async () => db;
  Booking.findOne = async () => null;
  // Atomic conditional write (status changes, cancel, review, email links): applies only while the filter matches.
  Booking.findOneAndUpdate = async (filter, update) => {
    await new Promise((r) => setImmediate(r)); // let a concurrent request read the same state first
    if (!matchesFilter(db, filter)) return null;
    applyUpdate(db, update);
    updates.push({ filter, update });
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

const NONCE = 'a'.repeat(32);
const emailToken = (action, over = {}) => jwt.sign({ bookingId: 'BKTEST', action, nonce: NONCE, ...over }, process.env.JWT_SECRET, { audience: 'email-action', expiresIn: '7d' });
const postEmailAction = (action, id, tok) => fetch(`${base}/admin/${action}/${id}`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `token=${encodeURIComponent(tok)}`,
}).then(async (r) => ({ status: r.status, text: await r.text() }));

test('admin email links: confirm only moves a pending booking, never a finished one, and the token is bound to the booking', async () => {
  const confirmToken = emailToken('confirm');
  Booking.findOne = async () => db;
  db = makeBooking({ status: 'in_progress', emailActionNonce: NONCE });
  assert.equal((await postEmailAction('confirm', 'BKTEST', confirmToken)).status, 409);
  assert.equal(db.status, 'in_progress');
  db = makeBooking({ status: 'completed', emailActionNonce: NONCE });
  assert.equal((await postEmailAction('confirm', 'BKTEST', confirmToken)).status, 409);
  assert.equal(db.status, 'completed');

  db = makeBooking({ status: 'pending', emailActionNonce: NONCE });
  assert.equal((await postEmailAction('confirm', 'OTHERBOOKING', confirmToken)).status, 403, 'token of a different booking');
  assert.equal((await postEmailAction('confirm', 'BKTEST', emailToken('cancel'))).status, 403, 'wrong action for this URL');
  assert.equal(db.status, 'pending');

  const ok = await postEmailAction('confirm', 'BKTEST', confirmToken);
  assert.equal(ok.status, 200);
  assert.equal(db.status, 'confirmed');
  assert.equal(db.statusHistory.at(-1).actorRole, 'admin');
});

test('admin email links: bad, legacy and expired tokens are 403 (not 200); a link works once', async () => {
  Booking.findOne = async () => db;
  db = makeBooking({ status: 'pending', emailActionNonce: NONCE });
  const legacy = jwt.sign({ bookingId: 'BKTEST', action: 'confirm' }, process.env.JWT_SECRET, { expiresIn: '7d' }); // no aud / nonce
  const otherAudience = jwt.sign({ bookingId: 'BKTEST', action: 'confirm', nonce: NONCE }, process.env.JWT_SECRET, { audience: 'login' });
  const expired = jwt.sign({ bookingId: 'BKTEST', action: 'confirm', nonce: NONCE, exp: Math.floor(Date.now() / 1000) - 10 }, process.env.JWT_SECRET, { audience: 'email-action' });
  const wrongNonce = emailToken('confirm', { nonce: 'b'.repeat(32) });
  for (const [label, tok] of [['garbage', 'not-a-token'], ['legacy', legacy], ['audience', otherAudience], ['expired', expired], ['nonce', wrongNonce]]) {
    assert.equal((await postEmailAction('confirm', 'BKTEST', tok)).status, 403, label);
    const page = await fetch(`${base}/admin/confirm/BKTEST?token=${encodeURIComponent(tok)}`);
    assert.equal(page.status, 403, `GET ${label}`);
  }
  assert.equal(db.status, 'pending');

  // GET shows the confirmation form for a good link without changing anything.
  const form = await fetch(`${base}/admin/confirm/BKTEST?token=${encodeURIComponent(emailToken('confirm'))}`);
  assert.equal(form.status, 200);
  assert.equal(db.status, 'pending');

  assert.equal((await postEmailAction('confirm', 'BKTEST', emailToken('confirm'))).status, 200);
  assert.equal(db.emailActionNonce, undefined, 'the nonce is consumed');
  await new Promise((r) => setTimeout(r, 30));
  const notesAfterFirst = notifications.length;
  const emailsAfterFirst = emails.length;
  assert.equal((await postEmailAction('confirm', 'BKTEST', emailToken('confirm'))).status, 403, 'second use of the same link');
  assert.equal((await postEmailAction('cancel', 'BKTEST', emailToken('cancel'))).status, 403, 'the other link of the same email is spent too');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(notifications.length, notesAfterFirst);
  assert.equal(emails.length, emailsAfterFirst);
  assert.equal(db.status, 'confirmed');

  Booking.findOne = async () => null;
  assert.equal((await postEmailAction('confirm', 'BKTEST', emailToken('confirm'))).status, 404);
});

test('admin email cancel link: cancels, emails and notifies the customer once', async () => {
  Booking.findOne = async () => db;
  db = makeBooking({ status: 'confirmed', emailActionNonce: NONCE });
  const res = await postEmailAction('cancel', 'BKTEST', emailToken('cancel'));
  assert.equal(res.status, 200);
  assert.equal(db.status, 'cancelled');
  assert.equal(db.cancellationReason, 'Cancelled by admin via email');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(emails.filter((m) => m.to?.[0]?.email === 'c@example.com' && /Cancelled/.test(m.subject)).length, 1, 'customer cancellation email');
  assert.equal(notifications.filter((n) => n.data?.event === 'cancelled').length, 1);
});

test('the email confirmation page escapes anything it prints', async () => {
  db = makeBooking({ status: 'pending', customerName: '<img src=x onerror=alert(1)>', emailActionNonce: NONCE });
  Booking.findOne = async () => db;
  const confirmToken = emailToken('confirm');
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
  assert.equal(notTechnicianRole.status, 400, 'only technician accounts can be assigned');

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

// ---------------------------------------------------------------------------------------------------------------
// Status machine per role (FIX-CONTRACT): admin / technician transition tables, atomic updates, 409 on repeats.
// ---------------------------------------------------------------------------------------------------------------
const ALL = ['pending', 'confirmed', 'assigned', 'on_the_way', 'in_progress', 'completed', 'cancelled'];
const ADMIN_OK = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  assigned: ['on_the_way', 'in_progress', 'cancelled'],
  on_the_way: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};
const TECH_OK = { assigned: ['on_the_way'], on_the_way: ['in_progress'], in_progress: ['completed'] };

test('status transitions follow the admin table exactly; "assigned" only via /assign', async () => {
  for (const from of ALL) {
    for (const to of ALL) {
      db = makeBooking({ status: from, technician: IDS.tech });
      const res = await call('PUT', `/${IDS.booking}/status`, IDS.admin, { status: to, reason: 'Customer asked' });
      let expected = ADMIN_OK[from].includes(to) ? 200 : 400;
      if (to === from) expected = to === 'assigned' ? 400 : 409; // a repeat of the current state is a conflict
      assert.equal(res.status, expected, `admin ${from} -> ${to}`);
      assert.equal(db.status, expected === 200 ? to : from, `admin ${from} -> ${to} stored`);
    }
  }
});

test('technicians: only their own bookings, only assigned -> on_the_way -> in_progress -> completed, never cancel', async () => {
  for (const from of ALL) {
    for (const to of ALL) {
      db = makeBooking({ status: from, technician: IDS.tech });
      const res = await call('PUT', `/${IDS.booking}/status`, IDS.tech, { status: to });
      let expected = (TECH_OK[from] || []).includes(to) ? 200 : 400;
      if (to === 'assigned') expected = 400;
      else if (to === from) expected = 409;
      else if (to === 'cancelled') expected = 403;
      assert.equal(res.status, expected, `technician ${from} -> ${to}`);
    }
  }
  db = makeBooking({ status: 'assigned', technician: IDS.other });
  assert.equal((await call('PUT', `/${IDS.booking}/status`, IDS.tech, { status: 'on_the_way' })).status, 403);
  assert.equal(db.status, 'assigned');
});

test('a double-clicked status change applies once: 409, one notification, one email', async () => {
  db = makeBooking({ status: 'pending' });
  const results = await Promise.all([
    call('PUT', `/${IDS.booking}/status`, IDS.admin, { status: 'confirmed' }),
    call('PUT', `/${IDS.booking}/status`, IDS.admin, { status: 'confirmed' }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const again = await call('PUT', `/${IDS.booking}/status`, IDS.admin, { status: 'confirmed' });
  assert.equal(again.status, 409);
  assert.equal(again.json.message, 'Booking was already changed');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(notifications.filter((n) => n.data?.event === 'confirmed').length, 1);
  assert.equal(emails.filter((m) => /CONFIRMED/.test(m.subject)).length, 1);
  assert.equal(updates.length, 1);
  const entry = db.statusHistory.at(-1);
  assert.equal(entry.actorRole, 'admin');
  assert.equal(String(entry.actor), IDS.admin);
});

test('expectedStatus that no longer matches is a 409 and changes nothing', async () => {
  db = makeBooking({ status: 'confirmed' });
  const res = await call('PUT', `/${IDS.booking}/status`, IDS.admin, { status: 'cancelled', expectedStatus: 'pending', reason: 'x' });
  assert.equal(res.status, 409);
  assert.equal(db.status, 'confirmed');
  assert.equal((await call('PUT', `/${IDS.booking}/status`, IDS.admin, { status: 'cancelled', expectedStatus: 'bogus' })).status, 400);
  const ok = await call('PUT', `/${IDS.booking}/status`, IDS.admin, { status: 'cancelled', expectedStatus: 'confirmed' });
  assert.equal(ok.status, 200);
});

test('admin cancel records the reason (default "Cancelled by admin") and never touches technicianNotes', async () => {
  db = makeBooking({ status: 'assigned', technician: IDS.tech, technicianNotes: 'Bring ladder' });
  const res = await call('PUT', `/${IDS.booking}/status`, IDS.admin, { status: 'cancelled', reason: 'Customer travelling', notes: 'admin text' });
  assert.equal(res.status, 200);
  assert.equal(db.cancellationReason, 'Customer travelling');
  assert.equal(db.technicianNotes, 'Bring ladder');
  assert.ok(db.cancelledAt instanceof Date);
  db = makeBooking({ status: 'pending' });
  await call('PUT', `/${IDS.booking}/status`, IDS.admin, { status: 'cancelled' });
  assert.equal(db.cancellationReason, 'Cancelled by admin');
});

test('assign: technician must exist, be active and available; repeat assignment is a 409; pending must be confirmed first', async () => {
  db = makeBooking({ status: 'pending' });
  assert.equal((await call('PUT', `/${IDS.booking}/assign`, IDS.admin, { technicianId: IDS.tech })).status, 400);
  db = makeBooking({ status: 'confirmed' });
  techProfile = { user: IDS.tech, active: true, availability: false };
  assert.equal((await call('PUT', `/${IDS.booking}/assign`, IDS.admin, { technicianId: IDS.tech })).status, 400, 'unavailable');
  techProfile = { user: IDS.tech, active: false, availability: true };
  assert.equal((await call('PUT', `/${IDS.booking}/assign`, IDS.admin, { technicianId: IDS.tech })).status, 400, 'inactive');
  techProfile = null;
  assert.equal((await call('PUT', `/${IDS.booking}/assign`, IDS.admin, { technicianId: IDS.tech })).status, 400, 'no technician profile');
  assert.equal(db.status, 'confirmed');

  techProfile = { user: IDS.tech, active: true, availability: true };
  const ok = await call('PUT', `/${IDS.booking}/assign`, IDS.admin, { technicianId: IDS.tech });
  assert.equal(ok.status, 200);
  assert.equal(db.status, 'assigned');
  const twice = await call('PUT', `/${IDS.booking}/assign`, IDS.admin, { technicianId: IDS.tech });
  assert.equal(twice.status, 409);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(notifications.filter((n) => n.data?.event === 'assigned').length, 1, 'customer told once');
  assert.equal(notifications.filter((n) => n.data?.event === 'assigned_to_you').length, 1, 'technician told once');
});

test('reschedule: date must be today..+60 days (Riyadh) and the time a real slot; who moved it is recorded', async () => {
  for (const bad of [{ date: day(-2), time: '10:00 AM' }, { date: day(75), time: '10:00 AM' }, { date: day(4), time: '25:00' }, { date: day(4), time: 'soon' }, { date: '2026-13-01' }]) {
    db = makeBooking();
    const res = await call('PUT', `/${IDS.booking}/reschedule`, IDS.customer, bad);
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  db = makeBooking();
  const own = await call('PUT', `/${IDS.booking}/reschedule`, IDS.customer, { date: day(4), time: '4:30pm' });
  assert.equal(own.status, 200);
  assert.equal(db.time, '04:30 PM');
  assert.equal(db.rescheduledBy, 'customer');
  assert.equal(db.previousSchedule.date, day(2));
  assert.equal(own.json.message, 'Booking rescheduled');

  db = makeBooking({ status: 'assigned', technician: IDS.tech });
  const byAdmin = await call('PUT', `/${IDS.booking}/reschedule`, IDS.admin, { date: day(6), time: '09:00 AM' });
  assert.equal(byAdmin.status, 200);
  assert.equal(db.rescheduledBy, 'admin');
  assert.match(byAdmin.json.message, /customer has been notified/);
  await new Promise((r) => setTimeout(r, 30));
  const note = notifications.at(-1);
  assert.match(note.message, /Our team moved your booking/);
  assert.match(note.data.messageAr, /قام فريقنا/);

  db = makeBooking({ status: 'assigned' });
  assert.equal((await call('PUT', `/${IDS.booking}/reschedule`, IDS.customer, { date: day(6) })).status, 400, 'customers cannot move an assigned job');
});

test('booking create: time is normalised, and the duplicate check matches legacy spellings and legacy service ids', async () => {
  let created;
  let duplicateQuery;
  const realCreate = Booking.create;
  Booking.create = async (data) => { created = data; return { ...data, _id: 'x' }; };
  Booking.findOne = async (q) => { if (q.time) duplicateQuery = q; return null; };
  try {
    const ok = await call('POST', '/public', IDS.customer, { ...goodBooking, time: '10:00am' });
    assert.equal(ok.status, 201);
    assert.equal(created.time, '10:00 AM');
    assert.ok(!('emailActionNonce' in ok.json.data.booking), 'the email-link secret is not sent to the customer');
    assert.match(created.emailActionNonce, /^[a-f0-9]{32}$/);
    assert.match(created.orderNumber, /^ORD-\d{8}-[A-F0-9]{8}$/);
    for (const legacy of ['10:00AM', '10:00 am', '10:00 AM', '10:00', ' 10:00 a.m. ']) assert.ok(duplicateQuery.time.test(legacy), legacy);
    for (const other of ['10:30 AM', '10:00 PM', '22:00', '1:00 AM']) assert.ok(!duplicateQuery.time.test(other), other);
    const ids = duplicateQuery.$or[0]['service.id'].$in.map(String);
    assert.ok(ids.includes('507f1f77bcf86cd799439013'), 'string id');
    assert.ok(duplicateQuery.$or[0]['service.id'].$in.some((v) => v && v._bsontype === 'ObjectId'), 'ObjectId');
    assert.deepEqual(duplicateQuery.deletedAt, null);
  } finally {
    Booking.create = realCreate;
  }
});

test('soft-deleted bookings are invisible to customers', async () => {
  db = makeBooking({ deletedAt: new Date() });
  Booking.findById = () => { const q = { populate: () => q, then: (r, j) => Promise.resolve(db).then(r, j) }; return q; };
  assert.equal((await call('GET', `/${IDS.booking}`, IDS.customer)).status, 404);
  Booking.findById = async () => db;
  assert.equal((await call('PUT', `/${IDS.booking}/cancel`, IDS.customer, {})).status, 404);
  assert.equal((await call('PUT', `/${IDS.booking}/reschedule`, IDS.customer, { date: day(4) })).status, 404);
  assert.equal((await call('PUT', `/${IDS.booking}/status`, IDS.admin, { status: 'confirmed' })).status, 404);
});

test('report-issue sends a bilingual notification', async () => {
  const res = await call('PUT', `/${IDS.booking}/report-issue`, IDS.admin, { issueType: 'invalid_address' });
  assert.equal(res.status, 200);
  const note = notifications.at(-1);
  assert.equal(note.title, 'Invalid Address');
  assert.equal(note.data.titleAr, 'العنوان غير صحيح');
  assert.match(note.data.messageAr, /عنوانك/);
  assert.ok(note.expiresAt instanceof Date && note.expiresAt > new Date(Date.now() + 89 * 86400000));
});
