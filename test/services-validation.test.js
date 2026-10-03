require('./helpers/quiet');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-only-secret-for-services-validation';

const User = require('../models/User');
const Service = require('../models/Service');
const servicesRouter = require('../routes/services');
const { slugify, baseSlugFor, uniqueSlug } = require('../utils/slug');

const ADMIN = '507f1f77bcf86cd799439051';
const SERVICE_ID = '507f1f77bcf86cd799439052';
const accounts = { [ADMIN]: { _id: ADMIN, role: 'admin', isVerified: true } };
const token = jwt.sign({ id: ADMIN, role: 'admin' }, process.env.JWT_SECRET);

const good = { name: 'Split AC Service', nameAr: 'صيانة مكيف سبليت', description: 'Full service', descriptionAr: 'صيانة كاملة', basePrice: 150, category: 'ac' };

let server; let base; let stored; let lastUpdate; let slugsInUse;
const saved = {};
test.before(async () => {
  Object.assign(saved, { findById: User.findById, save: Service.prototype.save, exists: Service.exists, svcFindById: Service.findById, update: Service.findByIdAndUpdate });
  User.findById = (id) => { const u = accounts[String(id)] || null; return { select: async () => u, then: (r, j) => Promise.resolve(u).then(r, j) }; };
  // The real document validation runs (so model-only rules are covered too); only the write is faked.
  Service.prototype.save = async function () { await this.validate(); stored = this; return this; };
  Service.exists = async (q) => (slugsInUse.has(q.slug) ? { _id: 'other' } : null);
  Service.findById = async () => (stored ? stored : null);
  Service.findByIdAndUpdate = async (id, update) => { lastUpdate = update; return { _id: id, ...update.$set }; };

  const app = express();
  app.use(express.json());
  app.use('/api/services', servicesRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/services`;
});
test.after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  User.findById = saved.findById; Service.prototype.save = saved.save; Service.exists = saved.exists;
  Service.findById = saved.svcFindById; Service.findByIdAndUpdate = saved.update;
});
test.beforeEach(() => { stored = null; lastUpdate = null; slugsInUse = new Set(); });

const send = async (method, path, body) => {
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
};

test('POST /services: every contract rule gives a 400 with errors[]', async () => {
  const bad = [
    { name: 'A' }, { name: 'x'.repeat(121) }, { name: 123 }, { nameAr: '' }, { nameAr: ['x', 'y'] },
    { description: 'x'.repeat(2001) }, { descriptionAr: undefined },
    { basePrice: -1 }, { basePrice: 100001 }, { basePrice: 'Infinity' }, { basePrice: 'NaN' }, { basePrice: '' }, { basePrice: true }, { basePrice: [1] },
    { category: 'cars' }, { warrantyDays: 1.5 }, { warrantyDays: -1 }, { warrantyDays: 99999 }, { estimatedDuration: 'x'.repeat(51) },
    { images: ['javascript:alert(1)'] }, { active: 'yes' }, { isPopular: 1 },
  ];
  for (const change of bad) {
    const res = await send('POST', '', { ...good, ...change });
    assert.equal(res.status, 400, JSON.stringify(change));
    assert.equal(res.json.success, false);
    assert.ok(Array.isArray(res.json.errors) && res.json.errors.length, `errors[] for ${JSON.stringify(change)}`);
  }
  assert.equal(stored, null);
});

test('POST /services stores a slug from the English name with the website rules (taken slugs get -2)', async () => {
  const ok = await send('POST', '', { ...good, basePrice: '99.5' });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.service.slug, 'split-ac-service-jeddah');
  assert.equal(ok.json.service.basePrice, 99.5);

  slugsInUse.add('split-ac-service-jeddah');
  const second = await send('POST', '', good);
  assert.equal(second.json.service.slug, 'split-ac-service-jeddah-2');

  // A slug reserved by a bundled catalogue service (or one of its old URL aliases) is never handed out again.
  const clash = await send('POST', '', { ...good, name: 'AC Repair' });
  assert.equal(clash.json.service.slug, 'ac-repair-jeddah-2');
  const alias = await send('POST', '', { ...good, name: 'Refrigerator Repair' });
  assert.equal(alias.json.service.slug, 'refrigerator-repair-jeddah-2');
});

test('PUT /services/:id validates partial updates; rename keeps the slug or first stores the old-name slug', async () => {
  for (const change of [{ basePrice: 'Infinity' }, { name: 'A' }, { active: 'false' }, { category: 'x' }, {}]) {
    const res = await send('PUT', `/${SERVICE_ID}`, change);
    assert.equal(res.status, 400, JSON.stringify(change));
  }
  assert.equal(lastUpdate, null);

  const toggle = await send('PUT', `/${SERVICE_ID}`, { active: false });
  assert.equal(toggle.status, 200);
  assert.deepEqual(lastUpdate.$set, { active: false });

  stored = new Service({ _id: SERVICE_ID, ...good, slug: 'split-ac-service-jeddah' });
  await send('PUT', `/${SERVICE_ID}`, { name: 'Brand New Name' });
  assert.equal(lastUpdate.$set.slug, undefined, 'a stored slug is never changed by a rename');
  assert.equal(lastUpdate.$set.name, 'Brand New Name');

  stored = new Service({ _id: SERVICE_ID, ...good }); // created before slugs were stored
  await send('PUT', `/${SERVICE_ID}`, { name: 'Brand New Name' });
  assert.equal(lastUpdate.$set.slug, 'split-ac-service-jeddah', 'slug of the OLD name');

  stored = new Service({ _id: '69cc4f6109b38c940b71d6ff', ...good, name: 'Refrigerator Repair' }); // bundled service
  await send('PUT', '/69cc4f6109b38c940b71d6ff', { name: 'Fridge Repair' });
  assert.equal(lastUpdate.$set.slug, 'refrigerator-freezer-repair-jeddah', 'bundled services keep their fixed slug');
});

test('model errors (ValidationError / CastError) are 400, not 500', async () => {
  Service.findByIdAndUpdate = async () => { const e = new Error('Cast to Number failed'); e.name = 'CastError'; e.path = 'basePrice'; throw e; };
  try {
    const res = await send('PUT', `/${SERVICE_ID}`, { basePrice: 5 });
    assert.equal(res.status, 400);
  } finally {
    Service.findByIdAndUpdate = async (id, update) => { lastUpdate = update; return { _id: id, ...update.$set }; };
  }
});

test('slug helpers match web/src/lib/serviceSlugs.js', async () => {
  assert.equal(slugify('Stove & Oven Repair'), 'stove-oven-repair-jeddah');
  assert.equal(slugify('  AC  Gas--Refill!! '), 'ac-gas-refill-jeddah');
  assert.equal(slugify('صيانة'), '');
  assert.equal(baseSlugFor({ _id: '69cc4f6109b38c940b71d706', name: 'Anything' }), 'oven-stove-repair-jeddah');
  assert.equal(await uniqueSlug('x-jeddah', 'id', async (s) => s !== 'x-jeddah-3'), 'x-jeddah-3');
});
