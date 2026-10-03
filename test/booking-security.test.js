require('./helpers/quiet');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');

process.env.JWT_SECRET = 'test-only-secret-for-booking-security';

const User = require('../models/User');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const router = require('../routes/bookings');
const FUTURE = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const FUTURE2 = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);

test('bookings require login, ignore client price and owner, and reject other owners', async () => {
  const originals = {
    findUser: User.findById,
    findService: Service.findOne,
    createBooking: Booking.create,
    findBooking: Booking.findById,
    findOneBooking: Booking.findOne,
    axiosPost: axios.post,
  };
  const userId = '507f1f77bcf86cd799439011';
  const otherId = '507f1f77bcf86cd799439012';
  const serviceId = '507f1f77bcf86cd799439013';
  const user = { _id: { toString: () => userId }, role: 'customer', isVerified: true, fullName: 'Customer', email: 'customer@example.com' };
  let saved;
  User.findById = () => ({ select: async () => user, then: (resolve, reject) => Promise.resolve(user).then(resolve, reject) });
  Service.findOne = async () => ({ _id: serviceId, name: 'AC Service', nameAr: 'AC', icon: '🔧', basePrice: 150, category: 'ac' });
  Booking.create = async (data) => { saved = data; return { ...data, _id: 'booking-db-id' }; };
  Booking.findOne = async () => null;
  Booking.findById = async () => ({ user: otherId, status: 'pending', statusHistory: [], save: async () => {} });
  axios.post = async () => ({ data: {} });

  const app = express();
  app.use(express.json());
  app.use('/api/bookings', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/bookings`;
  const token = jwt.sign({ id: userId, role: 'customer' }, process.env.JWT_SECRET);
  const body = { customerName: 'Customer', phone: '+966512345678', service: { id: serviceId, basePrice: 1 }, date: FUTURE, time: '10:00 AM', address: 'Jeddah, Saudi Arabia', userId: otherId };

  try {
    const guest = await fetch(`${url}/public`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(guest.status, 401);

    const created = await fetch(`${url}/public`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    assert.equal(created.status, 201);
    assert.equal(saved.user, user._id);
    assert.equal(saved.servicePrice, 150);
    assert.equal(saved.totalAmount, 180); // 150 service + 30 visit fee

    const packageRequest = { ...body, service: { id: 'pkg_villa', basePrice: 1 } };
    const packageCreated = await fetch(`${url}/public`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(packageRequest) });
    assert.equal(packageCreated.status, 201);
    assert.equal(saved.servicePrice, 1200);
    assert.equal(saved.visitCharges, 0);
    assert.equal(saved.totalAmount, 1200); // package price already includes the visit fee

    // The home-page packages are bookable at the same price the website shows (visit fee included)
    for (const [id, price] of [['pkg_diagnostic', 150], ['pkg_summer', 280]]) {
      const r = await fetch(`${url}/public`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...body, service: id }) });
      assert.equal(r.status, 201, id);
      assert.equal(saved.service.id, id);
      assert.equal(saved.servicePrice, price);
      assert.equal(saved.totalAmount, price);
    }

    // Unknown ids are still rejected
    const unknown = await fetch(`${url}/public`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...body, service: 'pkg_nope' }) });
    assert.equal(unknown.status, 404);

    const reschedule = await fetch(`${url}/${serviceId}/reschedule`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ date: FUTURE2, time: '11:00 AM' }) });
    assert.equal(reschedule.status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    User.findById = originals.findUser;
    Service.findOne = originals.findService;
    Booking.create = originals.createBooking;
    Booking.findById = originals.findBooking;
    Booking.findOne = originals.findOneBooking;
    axios.post = originals.axiosPost;
  }
});
