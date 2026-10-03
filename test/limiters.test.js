require('./helpers/quiet');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { mountAuthLimiters, failureSlowdown } = require('../utils/limiters');
const { containsOperator } = require('../utils/security');

test('code limits are per account, not shared by everyone on one network', async () => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  mountAuthLimiters(app);
  app.post('/api/auth/verify-otp', (req, res) => res.json({ ok: true }));
  app.post('/api/auth/login', (req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/auth`;
  const hit = (path, body, ip = '9.9.9.9') => fetch(`${url}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify(body),
  }).then((r) => r.status);
  try {
    // One account, 10 codes allowed per 10 minutes, the 11th is blocked...
    for (let i = 0; i < 10; i += 1) assert.equal(await hit('/verify-otp', { email: 'a@example.com' }), 200);
    assert.equal(await hit('/verify-otp', { email: 'a@example.com' }), 429);
    // ...but a different person on the SAME network is not affected,
    assert.equal(await hit('/verify-otp', { email: 'b@example.com' }), 200);
    // and an attacker elsewhere cannot use up the victim's budget from another IP.
    assert.equal(await hit('/verify-otp', { email: 'a@example.com' }, '8.8.8.8'), 200);
    // Login and code budgets are separate routes.
    assert.equal(await hit('/login', { email: 'a@example.com' }), 200);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

const withApp = async (setup, fn) => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  setup(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
};

test('admin login: limited per IP + email, so failures from other IPs cannot lock the real admin out', async () => {
  let realPassword = false;
  await withApp((app) => {
    mountAuthLimiters(app);
    app.post('/api/admin/login', (req, res) => (realPassword ? res.json({ success: true }) : res.status(401).json({ success: false })));
  }, async (base) => {
    const hit = (email, ip) => fetch(`${base}/api/admin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ email, password: 'x' }),
    }).then((r) => r.status);
    // The progressive delay starts after 5 failures; keep this test fast by spreading the 5 over attacker IPs.
    for (let i = 1; i <= 5; i += 1) assert.equal(await hit('admin@example.com', `10.0.0.${i}`), 401);
    realPassword = true;
    assert.equal(await hit('admin@example.com', '10.9.9.9'), 200, 'the admin from their own IP still gets in');
    realPassword = false;
    // One IP hammering one account is blocked after 10 tries.
    for (let i = 0; i < 10; i += 1) assert.equal(await hit('victim@example.com', '10.1.1.1'), 401);
    assert.equal(await hit('victim@example.com', '10.1.1.1'), 429);
  });
});

test('failure slowdown: delays grow after the free failures, never refuse, and reset on success', async () => {
  let ok = false;
  const slow = failureSlowdown({ freeFailures: 2, baseDelayMs: 60, maxDelayMs: 200 });
  await withApp((app) => {
    app.post('/login', slow, (req, res) => (ok ? res.json({ ok: true }) : res.status(401).json({ ok: false })));
  }, async (base) => {
    const timed = async (email = 'a@example.com') => {
      const t = Date.now();
      const res = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      return { status: res.status, ms: Date.now() - t };
    };
    await timed(); await timed(); // two free failures
    const third = await timed();
    assert.equal(third.status, 401);
    assert.ok(third.ms >= 55, `third attempt delayed (${third.ms}ms)`);
    const fourth = await timed();
    assert.ok(fourth.ms >= 110, `delay doubles (${fourth.ms}ms)`);
    const other = await timed('b@example.com');
    assert.ok(other.ms < 55, 'other accounts are not slowed down');
    ok = true;
    assert.equal((await timed()).status, 200);
    ok = false;
    assert.ok((await timed()).ms < 55, 'a successful login clears the counter');
  });
});

test('operator detection covers deeply nested payloads', () => {
  let deep = { $ne: 1 };
  for (let i = 0; i < 12; i += 1) deep = { a: deep };
  assert.equal(containsOperator(deep), true);
  assert.equal(containsOperator({ a: { b: { c: 'fine' } } }), false);
  assert.equal(containsOperator({ 'a.b': 1 }), true);
});
