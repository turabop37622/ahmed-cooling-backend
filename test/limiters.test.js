require('./helpers/quiet');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { mountAuthLimiters } = require('../utils/limiters');
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

test('operator detection covers deeply nested payloads', () => {
  let deep = { $ne: 1 };
  for (let i = 0; i < 12; i += 1) deep = { a: deep };
  assert.equal(containsOperator(deep), true);
  assert.equal(containsOperator({ a: { b: { c: 'fine' } } }), false);
  assert.equal(containsOperator({ 'a.b': 1 }), true);
});
