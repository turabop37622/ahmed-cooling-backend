require('./helpers/quiet');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');

process.env.JWT_SECRET = 'test-only-secret-for-hardening-tests';
process.env.BOOKING_RATE_LIMIT = '1000';

const User = require('../models/User');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const Technician = require('../models/Technician');
const Notification = require('../models/Notification');
const router = require('../routes/bookings');
const upload = require('../utils/multer');
const { mountAuthLimiters } = require('../utils/limiters');

const USER_ID = '507f1f77bcf86cd799439011';
const TECH_ID = '507f1f77bcf86cd799439015';
const BOOKING_ID = '507f1f77bcf86cd799439016';
const FUTURE = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const accounts = {
  [USER_ID]: { _id: USER_ID, role: 'customer', isVerified: true, fullName: 'Customer', email: 'c@example.com' },
  [TECH_ID]: { _id: TECH_ID, role: 'technician', isVerified: true, fullName: 'Tech' },
};
const token = (id) => jwt.sign({ id, role: accounts[id].role }, process.env.JWT_SECRET);
const goodBooking = { customerName: 'Customer', phone: '+966512345678', service: '1', date: FUTURE, time: '10:00 AM', address: 'Jeddah, Saudi Arabia' };

const withServer = async (app, fn) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
};
const bookingApp = () => { const app = express(); app.use(express.json()); app.use('/api/bookings', router); return app; };

test('Idempotency-Key: a retry returns the first booking, creates nothing and sends no second email', async () => {
  const saved = {};
  for (const [obj, name] of [[User, 'findById'], [Service, 'findOne'], [Booking, 'findOne'], [Booking, 'create'], [axios, 'post']]) saved[`${obj.modelName || 'axios'}.${name}`] = obj[name];
  const store = [];
  let emails = 0;
  User.findById = (id) => { const u = accounts[String(id)] || null; return { select: async () => u, then: (r, j) => Promise.resolve(u).then(r, j) }; };
  Service.findOne = async () => ({ _id: '507f1f77bcf86cd799439013', name: 'AC', basePrice: 150, category: 'ac' });
  Booking.findOne = async (q) => store.find((b) => q.idempotencyKey && b.idempotencyKey === q.idempotencyKey && String(b.user) === String(q.user)) || null;
  Booking.create = async (data) => { const b = { ...data, _id: `id${store.length}` }; store.push(b); return b; };
  axios.post = async () => { emails += 1; return { data: {} }; };
  try {
    await withServer(bookingApp(), async (base) => {
      const post = (key, body = goodBooking) => fetch(`${base}/api/bookings/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(USER_ID)}`, ...(key ? { 'Idempotency-Key': key } : {}) },
        body: JSON.stringify(body),
      });
      const first = await post('retry-key-12345');
      assert.equal(first.status, 201);
      const firstJson = await first.json();
      await new Promise((r) => setTimeout(r, 30));
      const emailsAfterFirst = emails;
      const second = await post('retry-key-12345');
      assert.equal(second.status, 201);
      const secondJson = await second.json();
      assert.equal(secondJson.data.bookingId, firstJson.data.bookingId);
      assert.equal(secondJson.success, true);
      assert.equal(store.length, 1);
      await new Promise((r) => setTimeout(r, 30));
      assert.equal(emails, emailsAfterFirst);
      assert.equal(store[0].idempotencyKey, 'retry-key-12345');

      const bad = await post('short');
      assert.equal(bad.status, 400);
      const other = await post('another-key-67890');
      assert.equal(other.status, 201);
      assert.equal(store.length, 2);
    });
  } finally {
    User.findById = saved['User.findById']; Service.findOne = saved['Service.findOne'];
    Booking.findOne = saved['Booking.findOne']; Booking.create = saved['Booking.create']; axios.post = saved['axios.post'];
  }
});

test('public reviews show only first name + last initial and a whitelisted city', async () => {
  const original = Booking.find;
  const rows = [
    { customerName: 'Ahmed Khan Al Harbi', address: 'Villa 12 Street 5 Al Salamah Jeddah', customerFeedback: { rating: 5, comment: 'ok', date: new Date() } },
    { customerName: 'Sara', address: 'Flat 3, Some Secret Street', customerFeedback: { rating: 4, comment: '', date: new Date() } },
    { customerName: 'Omar Zaid', address: 'حي العزيزية، مكة', customerFeedback: { rating: 3, comment: '', date: new Date() } },
  ];
  Booking.find = () => { const chain = { select: () => chain, sort: () => chain, limit: async () => rows }; return chain; };
  try {
    await withServer(bookingApp(), async (base) => {
      const json = await (await fetch(`${base}/api/bookings/public/reviews`)).json();
      assert.deepEqual(json.reviews.map((r) => [r.name, r.city]), [['Ahmed H.', 'Jeddah'], ['Sara', ''], ['Omar Z.', 'مكة']]);
      assert.ok(!JSON.stringify(json).includes('Secret'));
      assert.ok(json.reviews[0].rating && 'timeAgo' in json.reviews[0] && 'text' in json.reviews[0]);
    });
  } finally { Booking.find = original; }
});

test('a double-submitted review counts once and updates the technician once', async () => {
  const saved = { fbu: Booking.findOneAndUpdate, fbi: Booking.findById, tu: Technician.updateOne, ns: Notification.prototype.save, fu: User.findById };
  let doc = { _id: BOOKING_ID, user: USER_ID, technician: TECH_ID, status: 'completed', customerName: 'C', customerFeedback: { approved: false }, save: async () => {} };
  let techUpdates = 0;
  User.findById = (id) => { const u = accounts[String(id)] || null; return { select: async () => u, then: (r, j) => Promise.resolve(u).then(r, j) }; };
  Booking.findById = async () => doc; // both requests read the booking before either writes
  Booking.findOneAndUpdate = async (filter, update) => {
    assert.deepEqual(filter['customerFeedback.rating'], { $exists: false });
    if (doc.customerFeedback.rating) return null;
    doc.customerFeedback = update.$set.customerFeedback;
    return doc;
  };
  Technician.updateOne = async () => { techUpdates += 1; return {}; };
  try {
    await withServer(bookingApp(), async (base) => {
      const send = () => fetch(`${base}/api/bookings/${BOOKING_ID}/feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(USER_ID)}` }, body: JSON.stringify({ rating: 5 }),
      }).then((r) => r.status);
      const statuses = (await Promise.all([send(), send()])).sort();
      assert.deepEqual(statuses, [200, 400]);
      assert.equal(techUpdates, 1);
    });
  } finally {
    Booking.findOneAndUpdate = saved.fbu; Booking.findById = saved.fbi; Technician.updateOne = saved.tu; User.findById = saved.fu;
  }
});

test('the assigned technician can view and track a booking; other technicians cannot', async () => {
  const saved = { fbi: Booking.findById, fu: User.findById, tf: Technician.findOne };
  const OTHER_TECH = '507f1f77bcf86cd799439099';
  accounts[OTHER_TECH] = { _id: OTHER_TECH, role: 'technician', isVerified: true, fullName: 'Other' };
  const doc = { _id: BOOKING_ID, user: { _id: USER_ID }, technician: { _id: TECH_ID }, status: 'assigned' };
  User.findById = (id) => { const u = accounts[String(id)] || null; return { select: async () => u, then: (r, j) => Promise.resolve(u).then(r, j) }; };
  Booking.findById = () => { const q = { populate: () => q, then: (r, j) => Promise.resolve(doc).then(r, j) }; return q; };
  Technician.findOne = async () => null;
  try {
    await withServer(bookingApp(), async (base) => {
      const get = (path, who) => fetch(`${base}/api/bookings${path}`, { headers: { Authorization: `Bearer ${token(who)}` } }).then((r) => r.status);
      assert.equal(await get(`/${BOOKING_ID}`, TECH_ID), 200);
      assert.equal(await get(`/${BOOKING_ID}/track`, TECH_ID), 200);
      assert.equal(await get(`/${BOOKING_ID}`, USER_ID), 200);
      assert.equal(await get(`/${BOOKING_ID}`, OTHER_TECH), 403);
      assert.equal(await get(`/${BOOKING_ID}/track`, OTHER_TECH), 403);
    });
  } finally { Booking.findById = saved.fbi; User.findById = saved.fu; Technician.findOne = saved.tf; delete accounts[OTHER_TECH]; }
});

test('uploads accept only jpeg, png and webp', () => {
  const check = (mimetype) => new Promise((resolve) => upload.fileFilter({}, { mimetype }, (err, ok) => resolve(!err && ok === true)));
  return Promise.all(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif', 'text/html'].map(check)).then((r) => {
    assert.deepEqual(r, [true, true, true, false, false, false]);
  });
});

test('admin login is limited per account even when the attacker rotates IPs', async () => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  mountAuthLimiters(app);
  app.post('/api/admin/login', (req, res) => res.status(401).json({ success: false }));
  await withServer(app, async (base) => {
    const hit = (email, n) => fetch(`${base}/api/admin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.0.0.${n}` }, body: JSON.stringify({ email, password: 'x' }),
    }).then((r) => r.status);
    for (let i = 1; i <= 10; i += 1) assert.equal(await hit('admin@example.com', i), 401);
    assert.equal(await hit('admin@example.com', 50), 429); // new IP, same account
    assert.equal(await hit('someone@example.com', 51), 401);
  });
});

test('visit charge is NaN-safe and the schema default is 30', () => {
  assert.equal(new Booking({}).visitCharges, 30);
  const { execFileSync } = require('node:child_process');
  const out = execFileSync(process.execPath, ['-e', "process.env.VISIT_CHARGE='abc';process.env.JWT_SECRET='x';const r=require('./routes/bookings');console.log('ok')"], { cwd: require('node:path').join(__dirname, '..') });
  assert.match(String(out), /ok/);
});
