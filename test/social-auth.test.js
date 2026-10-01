require('./helpers/quiet');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const axios = require('axios');

process.env.JWT_SECRET = 'test-only-secret-for-social-auth';
const router = require('../routes/auth');

test('social login rejects an unverified client claim and wrong Google audience', async () => {
  const originalGet = axios.get;
  axios.get = async () => ({ data: { aud: 'some-other-app', expires_in: '100' } });
  const app = express();
  app.use(express.json());
  app.use('/api/auth', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/auth/social`;
  try {
    const claimOnly = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', provider: 'google' }) });
    assert.equal(claimOnly.status, 400);
    const wrongAudience = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: 'for-other-app' }) });
    assert.equal(wrongAudience.status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    axios.get = originalGet;
  }
});
