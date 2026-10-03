require('./helpers/quiet');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

process.env.JWT_SECRET = 'test-only-secret-for-users-admin-tests';

const User = require('../models/User');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const Product = require('../models/Products');
const cloudinary = require('../utils/cloudinary');
const usersRouter = require('../routes/users');
const adminRouter = require('../routes/admin');
const servicesRouter = require('../routes/services');
const productsRouter = require('../routes/products');
const { rejectMongoOperators } = require('../utils/security');

const ID = { customer: '507f1f77bcf86cd799439021', google: '507f1f77bcf86cd799439022', admin: '507f1f77bcf86cd799439023', other: '507f1f77bcf86cd799439024' };
let accounts;
const fresh = () => ({
  [ID.customer]: { _id: ID.customer, role: 'customer', isVerified: true, fullName: 'Cust', email: 'c@example.com', phone: '+966512345678', password: bcrypt.hashSync('secret12', 4), language: 'en', comparePassword: async function (p) { return bcrypt.compare(p, this.password); }, save: async function () { return this; } },
  [ID.google]: { _id: ID.google, role: 'customer', isVerified: true, fullName: 'G', email: 'g@example.com', password: null, comparePassword: async () => false, save: async function () { return this; } },
  [ID.admin]: { _id: ID.admin, role: 'admin', isVerified: true, fullName: 'Admin', email: 'a@example.com', password: bcrypt.hashSync('AdminPassword12', 4), comparePassword: async function (p) { return bcrypt.compare(p, this.password); }, save: async function () { return this; } },
});
const token = (id) => jwt.sign({ id, role: accounts[id].role }, process.env.JWT_SECRET);

let server; let base; let deleted; let anonymised; let bookingQuery; let serviceUpdate; let destroyed;
const saved = {};
test.before(async () => {
  Object.assign(saved, { findById: User.findById, findOne: User.findOne, deleteOne: User.deleteOne, updateMany: Booking.updateMany, find: Booking.find, count: Booking.countDocuments, svcUpdate: Service.findByIdAndUpdate, prodFind: Product.findById, destroy: cloudinary.uploader.destroy });
  User.findById = (id) => { const u = accounts[String(id)] || null; return { select: async () => u, then: (r, j) => Promise.resolve(u).then(r, j) }; };
  User.findOne = async (filter) => {
    if (filter.email) return Object.values(accounts).find((a) => a.email === filter.email) || null;
    if (filter.phone) return Object.values(accounts).find((a) => filter.phone.$in?.includes(a.phone) && String(a._id) !== String(filter._id?.$ne)) || null;
    return null;
  };
  User.deleteOne = async (f) => { deleted = f; };
  Booking.updateMany = async (filter, update) => { anonymised = { filter, update }; };
  Booking.find = (q) => { bookingQuery = { q }; const chain = { sort: () => chain, skip: (n) => { bookingQuery.skip = n; return chain; }, limit: (n) => { bookingQuery.limit = n; return Promise.resolve([]); } }; return chain; };
  Booking.countDocuments = async () => 0;
  Service.findByIdAndUpdate = async (id, update) => { serviceUpdate = update; return { _id: id, ...update.$set }; };
  cloudinary.uploader.destroy = async (publicId) => { destroyed = publicId; };

  const app = express();
  app.use(express.json());
  app.use(rejectMongoOperators);
  app.use('/api/users', usersRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/services', servicesRouter);
  app.use('/api/products', productsRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  User.findById = saved.findById; User.findOne = saved.findOne; User.deleteOne = saved.deleteOne;
  Booking.updateMany = saved.updateMany; Booking.find = saved.find; Booking.countDocuments = saved.count;
  Service.findByIdAndUpdate = saved.svcUpdate; Product.findById = saved.prodFind; cloudinary.uploader.destroy = saved.destroy;
});
test.beforeEach(() => { accounts = fresh(); deleted = null; anonymised = null; bookingQuery = null; serviceUpdate = null; destroyed = null; });

const call = async (method, path, who, body) => {
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${token(who)}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
};

test('deleting an account with a password works and keeps anonymised bookings', async () => {
  const wrong = await call('DELETE', '/users/account', ID.customer, { password: 'nope' });
  assert.equal(wrong.status, 401);
  assert.equal(deleted, null);
  const ok = await call('DELETE', '/users/account', ID.customer, { password: 'secret12' });
  assert.equal(ok.status, 200);
  assert.deepEqual(deleted, { _id: ID.customer });
  assert.equal(anonymised.update.$set.user, null);
  assert.equal(anonymised.update.$set.phone, 'deleted');
});

test('an account with open bookings cannot be deleted until they are cancelled', async () => {
  const realCount = Booking.countDocuments;
  Booking.countDocuments = async () => 2;
  try {
    const res = await call('DELETE', '/users/account', ID.customer, { password: 'secret12' });
    assert.equal(res.status, 409);
    assert.equal(deleted, null);
    assert.equal(anonymised, null);
  } finally {
    Booking.countDocuments = realCount;
  }
});

test('Google users (no password) can delete their account by typing DELETE; staff cannot', async () => {
  assert.equal((await call('DELETE', '/users/account', ID.google, {})).status, 400);
  assert.equal((await call('DELETE', '/users/account', ID.google, { confirm: 'DELETE' })).status, 200);
  assert.equal((await call('DELETE', '/users/account', ID.admin, { password: 'AdminPassword12' })).status, 403);
});

test('invoices endpoint answers instead of crashing', async () => {
  const res = await call('GET', '/users/invoices', ID.customer);
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.invoices, []);
});

test('profile: bad phone, taken phone and unknown language are rejected; a valid new number is saved normalised', async () => {
  assert.equal((await call('PUT', '/users/profile', ID.customer, { phone: '12345' })).status, 400);
  assert.equal((await call('PUT', '/users/profile', ID.customer, { phone: '+15551234567' })).status, 400);
  assert.equal((await call('PUT', '/users/profile', ID.customer, { phone: '+923001234567' })).status, 400, 'new non-Saudi numbers are refused');
  accounts[ID.google].phone = '+923001234567'; // an older account that still holds a Pakistani number
  const legacy = await call('PUT', '/users/profile', ID.google, { phone: '+923001234567', address: 'Riyadh' });
  assert.equal(legacy.status, 200, 're-saving the number already on the account must keep working');
  assert.equal((await call('PUT', '/users/profile', ID.customer, { language: 'xx' })).status, 400);
  assert.equal((await call('PUT', '/users/profile', ID.customer, { fullName: { $set: 1 } })).status, 400);
  accounts[ID.other] = { _id: ID.other, phone: '+966599999999' };
  assert.equal((await call('PUT', '/users/profile', ID.customer, { phone: '+966599999999' })).status, 409);
  accounts[ID.customer].isPhoneVerified = true;
  const ok = await call('PUT', '/users/profile', ID.customer, { phone: '+966 58 888 8888', address: 'Jeddah' });
  assert.equal(ok.status, 200);
  assert.equal(accounts[ID.customer].phone, '+966588888888');
  assert.equal(accounts[ID.customer].isPhoneVerified, true, 'editing the number must not lock a phone-registered user out of phone login');
  const same = await call('PUT', '/users/profile', ID.customer, { phone: '+966 58 888 8888' });
  assert.equal(same.status, 200);
});

test('changing the password needs the current one and a sane new one', async () => {
  assert.equal((await call('PUT', '/users/change-password', ID.customer, { currentPassword: 'wrong', newPassword: 'newpass123' })).status, 401);
  assert.equal((await call('PUT', '/users/change-password', ID.customer, { currentPassword: 'secret12', newPassword: '123' })).status, 400);
  assert.equal((await call('PUT', '/users/change-password', ID.customer, { currentPassword: 'secret12', newPassword: 'x'.repeat(200) })).status, 400);
  assert.equal((await call('PUT', '/users/change-password', ID.customer, { currentPassword: 'secret12', newPassword: 'newpass123' })).status, 200);
});

test('admin routes: customers are refused, page size is capped, bad ids are not server errors', async () => {
  assert.equal((await call('GET', '/admin/stats', ID.customer)).status, 403);
  assert.equal((await call('GET', '/admin/bookings')).status, 401);
  const list = await call('GET', '/admin/bookings?limit=100000&page=-5&status[$ne]=x', ID.admin);
  assert.equal(list.status, 400, 'operator in the query string is refused');
  const realAggregate = Booking.aggregate;
  let pipeline;
  Booking.aggregate = async (p) => { pipeline = p; return [{ byStatus: [], emergency: [], total: [], rows: [] }]; };
  try {
    const capped = await call('GET', '/admin/bookings?limit=100000&page=-5', ID.admin);
    assert.equal(capped.status, 200);
    const rows = pipeline.at(-1).$facet.rows;
    assert.equal(rows.find((s) => s.$limit).$limit, 100);
    assert.equal(rows.find((s) => '$skip' in s).$skip, 0);
  } finally {
    Booking.aggregate = realAggregate;
  }
  const realFindOne = Booking.findOne;
  Booking.findOne = () => { const q = { select: () => q, lean: async () => null }; return q; };
  try {
    assert.equal((await call('DELETE', '/admin/bookings/not-an-id', ID.admin)).status, 404);
  } finally {
    Booking.findOne = realFindOne;
  }
  assert.equal((await call('GET', '/admin/users/not-an-id/bookings', ID.admin)).status, 404);
});

test('admin login has no built-in fallback account and rejects non-string input', async () => {
  const noUser = await call('POST', '/admin/login', null, { email: 'admin@example.com', password: 'anything' });
  assert.equal(noUser.status, 401);
  const badType = await call('POST', '/admin/login', null, { email: ['a'], password: {} });
  assert.equal(badType.status, 400);
});

test('services: admin writes only whitelisted fields; the public list never shows inactive services', async () => {
  const res = await call('PUT', '/services/507f1f77bcf86cd799439031', ID.admin, { basePrice: 99, _id: 'evil', createdAt: '2000-01-01', role: 'admin' });
  assert.equal(res.status, 200);
  assert.deepEqual(serviceUpdate.$set, { basePrice: 99 });
  assert.equal((await call('PUT', '/services/not-an-id', ID.admin, { basePrice: 1 })).status, 404);
  assert.equal((await call('PUT', '/services/507f1f77bcf86cd799439031', ID.customer, { basePrice: 1 })).status, 403);

  let seenQuery;
  Service.find = (q) => { seenQuery = q; return { sort: async () => [] }; };
  await call('GET', '/services?active=false');
  assert.equal(seenQuery.active, true);
});

test('products: replacing an image without a file changes nothing and never deletes the old picture', async () => {
  Product.findById = async () => ({ imagePublicId: 'old-image', save: async () => {} });
  const res = await call('PUT', '/products/507f1f77bcf86cd799439041/image', ID.admin, {});
  assert.equal(res.status, 400);
  assert.equal(destroyed, null);
  assert.equal((await call('PUT', '/products/507f1f77bcf86cd799439041/image', ID.customer, {})).status, 403);
  assert.equal((await call('GET', '/products/brands?category[$ne]=x')).status, 400);
});
