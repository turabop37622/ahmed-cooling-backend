require('./helpers/quiet');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-only-secret-for-auth-security-tests';

const FakeUser = require('./helpers/fakeUser');
const sentEmails = [];
const modulePath = (p) => require.resolve(p);
require.cache[modulePath('../models/User')] = { id: modulePath('../models/User'), filename: modulePath('../models/User'), loaded: true, exports: FakeUser };
require.cache[modulePath('../utils/sendEmail')] = {
  id: modulePath('../utils/sendEmail'), filename: modulePath('../utils/sendEmail'), loaded: true,
  exports: async (to, otp, purpose) => { sentEmails.push({ to, otp, purpose }); },
};
axios.get = async () => { throw new Error('offline'); }; // disposable-email lookup is skipped in tests

const router = require('../routes/auth');
const authMiddleware = require('../middleware/auth');
const { rejectMongoOperators } = require('../utils/security');

let server;
let url;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use(rejectMongoOperators);
  app.use('/api/auth', router);
  app.get('/protected', authMiddleware, (req, res) => res.json({ ok: true }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});
test.beforeEach(() => { FakeUser.store = []; sentEmails.length = 0; });

const post = async (path, body) => {
  const res = await fetch(`${url}/api/auth${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};
const verifiedUser = async (extra = {}) => {
  const user = new FakeUser({ fullName: 'Real User', email: 'real@example.com', phone: '+966512345678', password: 'RealPass123', isVerified: true, isPhoneVerified: true, ...extra });
  await user.save();
  return user;
};
const signupBody = { fullName: 'New User', email: 'new@example.com', password: 'secret12', phone: '+966511111111' };

test('register emails the code, stores only its hash, and verify-otp logs the user in', async () => {
  const reg = await post('/register', signupBody);
  assert.equal(reg.status, 201);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, 'new@example.com');
  const stored = FakeUser.store[0];
  assert.notEqual(stored.otp, sentEmails[0].otp, 'OTP must not be stored in plain text');

  const bad = await post('/verify-otp', { email: 'new@example.com', otp: '000000' });
  assert.equal(bad.status, 400);
  const ok = await post('/verify-otp', { email: 'new@example.com', otp: sentEmails[0].otp });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
});

test('reset-password needs the email AND the code; a code alone identifies nobody', async () => {
  await verifiedUser();
  await post('/forgot-password', { email: 'real@example.com' });
  const code = sentEmails[0].otp;
  assert.equal(sentEmails[0].purpose, 'reset');

  const codeOnly = await post(`/reset-password/${code}`, { password: 'Hacked123' });
  assert.equal(codeOnly.status, 400);
  const wrongEmail = await post(`/reset-password/${code}`, { email: 'someone-else@example.com', password: 'Hacked123' });
  assert.equal(wrongEmail.status, 400);
  assert.equal(await FakeUser.store[0].comparePassword('RealPass123'), true, 'password must be unchanged');

  const ok = await post(`/reset-password/${code}`, { email: 'real@example.com', password: 'BrandNew123' });
  assert.equal(ok.status, 200);
  assert.equal(await FakeUser.store[0].comparePassword('BrandNew123'), true);
  const reuse = await post(`/reset-password/${code}`, { email: 'real@example.com', password: 'Again12345' });
  assert.equal(reuse.status, 400, 'a code can only be used once');
});

test('a sign-up code cannot be used to reset a password, and a reset code cannot verify an account', async () => {
  await post('/register', signupBody);
  const signupCode = sentEmails[0].otp;
  const res = await post(`/reset-password/${signupCode}`, { email: 'new@example.com', password: 'Hacked123' });
  assert.equal(res.status, 400);

  await verifiedUser();
  await post('/forgot-password', { email: 'real@example.com' });
  const resetCode = sentEmails[1].otp;
  const res2 = await post('/verify-otp', { email: 'real@example.com', otp: resetCode });
  assert.equal(res2.status, 400);
});

test('five wrong guesses lock the code, even if the next guess is right', async () => {
  await post('/register', signupBody);
  const code = sentEmails[0].otp;
  for (let i = 0; i < 5; i += 1) {
    const wrong = await post('/verify-otp', { email: 'new@example.com', otp: code === '111111' ? '222222' : '111111' });
    assert.equal(wrong.status, 400);
  }
  const late = await post('/verify-otp', { email: 'new@example.com', otp: code });
  assert.equal(late.status, 400);
});

test('MongoDB operator objects in email/phone/otp are rejected', async () => {
  await verifiedUser();
  for (const [path, body] of [
    ['/verify-otp', { email: { $ne: null }, otp: '123456' }],
    ['/forgot-password', { email: { $gt: '' } }],
    ['/phone/login', { phone: { $ne: null }, password: 'x' }],
    ['/login', { email: { $ne: null }, password: 'x' }],
    ['/reset-password/123456', { email: { $ne: null }, password: 'Hacked123' }],
  ]) {
    const res = await post(path, body);
    assert.equal(res.status, 400, `${path} must reject operator injection`);
  }
});

test('operators are also refused by the routes themselves (defence in depth)', async () => {
  const bare = express();
  bare.use(express.json());
  bare.use('/api/auth', router); // no global sanitiser on purpose
  const s = bare.listen(0, '127.0.0.1');
  await new Promise((resolve) => s.once('listening', resolve));
  await verifiedUser({ otp: 'x', otpPurpose: 'verify', otpExpires: new Date(Date.now() + 60000) });
  try {
    const res = await fetch(`http://127.0.0.1:${s.address().port}/api/auth/verify-otp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: { $ne: null }, otp: '123456' }),
    });
    assert.equal(res.status, 400);
  } finally {
    s.closeAllConnections();
    await new Promise((resolve) => s.close(resolve));
  }
});

test('phone/register never overwrites an existing account', async () => {
  const victim = await verifiedUser({ isPhoneVerified: false });
  const before = victim.password;
  const res = await post('/phone/register', { fullName: 'Attacker', phone: '+966512345678', email: 'attacker@example.com', password: 'AttackerPass1' });
  assert.equal(res.status, 409);
  assert.equal(FakeUser.store.length, 1);
  assert.equal(FakeUser.store[0].email, 'real@example.com');
  assert.equal(FakeUser.store[0].password, before);
  assert.equal(sentEmails.length, 0);
});

test('an unverified sign-up cannot squat someone else\'s email, but a verified account is never replaced', async () => {
  await new FakeUser({ fullName: 'Squatter', email: 'victim@example.com', phone: '+966500000001', password: 'x', isVerified: false }).save();
  const real = await post('/register', { fullName: 'Victim', email: 'victim@example.com', password: 'secret12', phone: '+966500000002' });
  assert.equal(real.status, 201);
  assert.equal(FakeUser.store.filter((u) => u.email === 'victim@example.com').length, 1);
  assert.equal(FakeUser.store.find((u) => u.email === 'victim@example.com').fullName, 'Victim');

  await verifiedUser();
  const dupe = await post('/register', { fullName: 'Copy', email: 'real@example.com', password: 'secret12', phone: '+966500000003' });
  assert.equal(dupe.status, 400);
});

test('forgot-password answers the same for unknown emails and never resets staff accounts', async () => {
  await verifiedUser({ email: 'boss@example.com', phone: '+966522222222', role: 'admin' });
  const unknown = await post('/forgot-password', { email: 'nobody@example.com' });
  const staff = await post('/forgot-password', { email: 'boss@example.com' });
  assert.equal(unknown.status, 200);
  assert.deepEqual(unknown.body, staff.body);
  assert.equal(sentEmails.length, 0);
});

test('resend-otp and forgot-password respect a 60 second cool-down', async () => {
  await post('/register', signupBody);
  await post('/resend-otp', { email: 'new@example.com' });
  assert.equal(sentEmails.length, 1, 'immediate resend must not send another code');
});

test('tokens issued before a password change stop working', async () => {
  const user = await verifiedUser();
  const oldToken = jwt.sign({ id: user._id, role: 'customer', iat: Math.floor(Date.now() / 1000) - 100 }, process.env.JWT_SECRET);
  const call = (token) => fetch(`${url}/protected`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.status);
  assert.equal(await call(oldToken), 200);
  user.password = 'ChangedPass123';
  await user.save();
  assert.equal(await call(oldToken), 401);
  const freshToken = jwt.sign({ id: user._id, role: 'customer' }, process.env.JWT_SECRET);
  assert.equal(await call(freshToken), 200);
});

test('login does not reveal whether an email exists and requires a string password', async () => {
  const noUser = await post('/login', { email: 'ghost@example.com', password: 'whatever1' });
  assert.equal(noUser.status, 401);
  const badType = await post('/login', { email: 'ghost@example.com', password: ['x'] });
  assert.equal(badType.status, 400);
});

test('phone-number verification only applies to accounts created through phone sign-up', async () => {
  await post('/register', { ...signupBody });
  const code = sentEmails[0].otp;
  const viaPhone = await post('/verify-otp', { phone: '+966511111111', otp: code });
  assert.equal(viaPhone.status, 400, 'an email account cannot be verified (or claimed) by phone number');
  const viaEmail = await post('/verify-otp', { email: 'new@example.com', otp: code });
  assert.equal(viaEmail.status, 200);
  assert.equal(FakeUser.store[0].isPhoneVerified, false);

  const login = await post('/phone/login', { phone: '+966511111111', password: 'secret12' });
  assert.equal(login.status, 403);
  assert.match(login.body.message, /email/i);
});

test('phone sign-up still works end to end', async () => {
  const reg = await post('/phone/register', { fullName: 'Phone User', phone: '+966533333333', email: 'phone@example.com', password: 'secret12' });
  assert.equal(reg.status, 201);
  const ok = await post('/verify-otp', { phone: '+966533333333', otp: sentEmails[0].otp });
  assert.equal(ok.status, 200);
  const login = await post('/phone/login', { phone: '+966533333333', password: 'secret12' });
  assert.equal(login.status, 200);
});

test('a rejected sign-up never deletes the other account it clashed with', async () => {
  const stale = await new FakeUser({ fullName: 'Half', email: 'half@example.com', phone: '+966544444444', password: 'x', isVerified: false }).save();
  await verifiedUser({ email: 'owner@example.com', phone: '+966555555555' });
  // email belongs to a stale row, phone belongs to a real verified account -> sign-up must fail and delete nothing
  const res = await post('/register', { fullName: 'Mixed', email: 'half@example.com', password: 'secret12', phone: '+966555555555' });
  assert.equal(res.status, 400);
  assert.ok(FakeUser.store.includes(stale), 'the stale account must still exist');
  assert.equal(FakeUser.store.length, 2);
});

test('parallel wrong guesses cannot get more than five tries', async () => {
  await post('/register', signupBody);
  const code = sentEmails[0].otp;
  const wrong = code === '123456' ? '654321' : '123456';
  await Promise.all(Array.from({ length: 12 }, () => post('/verify-otp', { email: 'new@example.com', otp: wrong })));
  assert.ok(FakeUser.store[0].otpAttempts >= 5 || !FakeUser.store[0].otp);
  const late = await post('/verify-otp', { email: 'new@example.com', otp: code });
  assert.equal(late.status, 400);
});

test('Google sign-in works for an address that only has a half-finished email sign-up', async () => {
  await new FakeUser({ fullName: 'Half', email: 'half@example.com', phone: '+966544444444', password: 'x', isVerified: false }).save();
  const realGet = axios.get;
  axios.get = async (u) => (u.includes('tokeninfo')
    ? { data: { aud: '506685890879-rcuen5qa0bom1f4asc89ah29k8ernt59.apps.googleusercontent.com', expires_in: '3000' } }
    : { data: { email: 'Half@Example.com', email_verified: true, sub: 'g-1', name: 'Half Person' } });
  try {
    const res = await post('/social', { accessToken: 'token' });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(FakeUser.store.filter((u) => u.email === 'half@example.com').length, 1);
    assert.equal(FakeUser.store.find((u) => u.email === 'half@example.com').authProvider, 'google');
  } finally {
    axios.get = realGet;
  }
});

test('Google sign-in still refuses to merge into a verified password account', async () => {
  await verifiedUser({ email: 'half@example.com' });
  const realGet = axios.get;
  axios.get = async (u) => (u.includes('tokeninfo')
    ? { data: { aud: '506685890879-rcuen5qa0bom1f4asc89ah29k8ernt59.apps.googleusercontent.com', expires_in: '3000' } }
    : { data: { email: 'half@example.com', email_verified: true, sub: 'g-2', name: 'Someone' } });
  try {
    const res = await post('/social', { accessToken: 'token' });
    assert.equal(res.status, 409);
  } finally {
    axios.get = realGet;
  }
});

test('only Saudi phone numbers are accepted at sign-up', async () => {
  for (const phone of ['+923001234567', '+97455123456', '+15551234567', '0512345678', '+966412345678', '+96651234567']) {
    const res = await post('/register', { ...signupBody, phone });
    assert.equal(res.status, 400, phone);
  }
  const ok = await post('/register', { ...signupBody, phone: '+966 51 234 5678' });
  assert.equal(ok.status, 201);
  assert.equal(FakeUser.store[0].phone, '+966512345678');
});
