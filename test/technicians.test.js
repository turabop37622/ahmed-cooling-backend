require('./helpers/quiet');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-only-secret-for-technician-tests';

const User = require('../models/User');
const Booking = require('../models/Booking');
const Technician = require('../models/Technician');
const CommissionSettlement = require('../models/CommissionSettlement');
const AppSetting = require('../models/AppSetting');
const AuditLog = require('../models/AuditLog');
const technicianStats = require('../utils/technicianStats');
const autoAssign = require('../utils/autoAssign');
const { computeCommission, parseAmountCollected } = require('../utils/commission');
const phone = require('../utils/phone');
const adminRouter = require('../routes/admin');
const technicianRouter = require('../routes/technician');
const { helpers: adminTech } = require('../routes/adminTechnicians');
const { rejectMongoOperators } = require('../utils/security');
const realStatsFor = technicianStats.statsFor; // the HTTP tests below replace it

const ADMIN = '507f1f77bcf86cd799439061';
const TECH = '507f1f77bcf86cd799439062';
const OTHER_TECH = '507f1f77bcf86cd799439063';
const accounts = {
  [ADMIN]: { _id: ADMIN, role: 'admin', isVerified: true },
  [TECH]: { _id: TECH, role: 'technician', isVerified: true, fullName: 'Tech One', phone: '+966551234567' },
  [OTHER_TECH]: { _id: OTHER_TECH, role: 'technician', isVerified: true, fullName: 'Tech Two' },
};
const token = (id) => jwt.sign({ id, role: accounts[id].role }, process.env.JWT_SECRET);

// A query stand-in: every chain method returns itself and awaiting it yields `value` (or value()).
const chain = (value) => {
  const q = {};
  for (const m of ['select', 'lean', 'populate', 'sort', 'skip', 'limit']) q[m] = () => q;
  q.then = (resolve, reject) => Promise.resolve(typeof value === 'function' ? value() : value).then(resolve, reject);
  return q;
};

// ---------------------------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------------------------
test('phone numbers: every Saudi spelling reduces to +9665XXXXXXXX', () => {
  for (const v of ['0551234567', '551234567', '966551234567', '00966551234567', '+966551234567', '+966 55 123 4567', '055-123-4567', '٠٥٥١٢٣٤٥٦٧']) {
    assert.equal(phone.normalizePhone(v), '+966551234567', v);
    assert.equal(phone.validatePhone(v).valid, true, v);
    const variants = phone.phoneVariants(v);
    for (const stored of ['+966551234567', '0551234567', '966551234567']) assert.ok(variants.includes(stored), `${v} -> ${stored}`);
  }
  for (const bad of ['+923001234567', '0451234567', '05512345', '+9665512345678', 'abc', '']) {
    assert.equal(phone.validatePhone(bad).valid, false, bad);
  }
  assert.match(phone.validatePhone('+97455123456').msg, /Only Saudi Arabia/);
});

test('auto-assign: city names (English / Arabic) map to jeddah / makkah', () => {
  for (const v of ['Jeddah', 'jidda', 'JEDDAH, Saudi Arabia', 'جدة', 'جده', 'Al Rawdah, Jeddah 23434']) assert.equal(autoAssign.normalizeCity(v), 'jeddah', v);
  for (const v of ['Makkah', 'Mecca', 'Makkah Al Mukarramah', 'مكة', 'مكة المكرمة', 'مكه']) assert.equal(autoAssign.normalizeCity(v), 'makkah', v);
  for (const v of ['Riyadh', '', null, 'الرياض']) assert.equal(autoAssign.normalizeCity(v), null, String(v));
  assert.equal(autoAssign.bookingCity({ city: '', address: 'Street 5, Jeddah' }), 'jeddah', 'falls back to the address');
});

test('auto-assign: city and specialty matching', () => {
  const m = autoAssign.profileMatches;
  assert.equal(m({ cities: ['jeddah'], skills: ['ac'] }, 'jeddah', 'ac'), true);
  assert.equal(m({ cities: ['jeddah'], skills: ['ac'] }, 'makkah', 'ac'), false, 'other city');
  assert.equal(m({ cities: ['jeddah'], skills: ['ac'] }, 'jeddah', 'stove'), false, 'other specialty');
  assert.equal(m({ cities: [], skills: [] }, 'makkah', 'stove'), true, 'no cities / no specialties = all');
  assert.equal(m({ cities: ['makkah'], skills: [] }, null, 'ac'), false, 'unknown city: only technicians without cities');
  assert.equal(m({ cities: [], skills: ['ac'] }, null, 'ac'), true);
});

test('auto-assign: fewest open jobs that day, then no active job, then oldest last assignment', () => {
  const pick = autoAssign.pickTechnician;
  const t = (userId, openJobs, hasActiveJob, lastAssignedAt) => ({ userId, openJobs, hasActiveJob, lastAssignedAt });
  assert.equal(pick([]), null);
  assert.equal(pick([t('a', 2, false, null), t('b', 1, true, new Date())]).userId, 'b', 'load first');
  assert.equal(pick([t('a', 1, true, null), t('b', 1, false, new Date())]).userId, 'b', 'then not busy right now');
  assert.equal(pick([t('a', 1, false, new Date('2026-10-02')), t('b', 1, false, new Date('2026-10-01'))]).userId, 'b', 'then oldest assignment');
  assert.equal(pick([t('a', 1, false, new Date('2026-10-01')), t('b', 1, false, null)]).userId, 'b', 'never assigned counts as oldest');
  assert.equal(pick([t('b', 0, false, null), t('a', 0, false, null)]).userId, 'a', 'stable by id');
});

test('auto-assign: end to end picks the matching, least loaded technician; nobody -> stays pending', async () => {
  const saved = { tFind: Technician.find, uFind: User.find, bAgg: Booking.aggregate, bFoau: Booking.findOneAndUpdate };
  const T = (n) => `507f1f77bcf86cd7994391${String(n).padStart(2, '0')}`;
  const profiles = [
    { user: T(1), cities: ['jeddah'], skills: ['ac'] },          // match, 2 open jobs that day
    { user: T(2), cities: ['jeddah'], skills: [] },              // match, 1 open job
    { user: T(3), cities: ['makkah'], skills: [] },              // wrong city
    { user: T(4), cities: ['jeddah'], skills: ['stove'] },       // wrong specialty
    { user: T(5), cities: [], skills: [] },                      // match (all), 1 open job but busy now
    { user: T(6), cities: ['jeddah'], skills: ['ac'] },          // matches but its user is not verified
  ];
  let techQuery; let userQuery; let pipeline; let write;
  Technician.find = (q) => { techQuery = q; return chain(profiles); };
  User.find = (q) => { userQuery = q; return chain(q._id.$in.filter((id) => id !== T(6)).map((id) => ({ _id: id, fullName: `Tech ${id.slice(-2)}` }))); };
  Booking.aggregate = async (p) => { pipeline = p; return [{ _id: T(1), openJobs: 2, activeJobs: 0 }, { _id: T(2), openJobs: 1, activeJobs: 0 }, { _id: T(5), openJobs: 1, activeJobs: 1 }]; };
  Booking.findOneAndUpdate = async (filter, update) => { write = { filter, update }; return { _id: 'b1', status: 'assigned', technician: update.$set.technician }; };
  try {
    const booking = { _id: 'b1', status: 'pending', city: 'جدة', date: '2026-10-20', service: { category: 'ac' } };
    const result = await autoAssign.autoAssignBooking(booking);
    assert.deepEqual(techQuery, { autoAssign: true, active: { $ne: false }, availability: { $ne: false } });
    assert.deepEqual(userQuery._id.$in.sort(), [T(1), T(2), T(5), T(6)].sort());
    assert.equal(userQuery.role, 'technician');
    assert.equal(userQuery.isVerified, true);
    assert.equal(String(result.booking.technician), T(2), 'T2: 1 open job and not busy');
    assert.deepEqual(write.filter, { _id: 'b1', status: 'pending', technician: null, deletedAt: null }, 'atomic, only while still pending');
    assert.equal(write.update.$set.assignedBy, 'auto');
    assert.ok(write.update.$set.assignedAt instanceof Date);
    assert.deepEqual(write.update.$push.statusHistory.$each.map((h) => [h.status, h.actorRole]), [['confirmed', 'system'], ['assigned', 'system']]);
    assert.equal(JSON.stringify(pipeline).includes('2026-10-20'), true, 'load counted on the booking date');

    write = null;
    assert.equal(await autoAssign.autoAssignBooking({ _id: 'b2', status: 'pending', city: 'Riyadh', date: '2026-10-20', service: { category: 'refrigerator' } }).then((r) => r && String(r.booking.technician)), T(5), 'unknown city: only the "all cities" technician');
    profiles.splice(4, 1);
    assert.equal(await autoAssign.autoAssignBooking({ _id: 'b3', status: 'pending', city: 'Riyadh', service: { category: 'ac' } }), null, 'nobody matches');
    assert.equal(await autoAssign.autoAssignBooking({ _id: 'b4', status: 'confirmed', city: 'Jeddah' }), null, 'only pending bookings');

    Booking.findOneAndUpdate = async () => null; // changed meanwhile
    assert.equal(await autoAssign.autoAssignBooking({ _id: 'b5', status: 'pending', city: 'Jeddah', service: { category: 'ac' } }), null);
    Technician.find = () => chain(() => { throw new Error('db down'); });
    assert.equal(await autoAssign.autoAssignBooking({ _id: 'b6', status: 'pending', city: 'Jeddah' }), null, 'errors never escape');
  } finally {
    Object.assign(Technician, { find: saved.tFind });
    User.find = saved.uFind;
    Booking.aggregate = saved.bAgg;
    Booking.findOneAndUpdate = saved.bFoau;
  }
});

test('commission math: rate of the base, 2-decimal rounding, share = base - commission', () => {
  assert.deepEqual(computeCommission(250, 0.07), { rate: 0.07, base: 250, amount: 17.5, technicianShare: 232.5 });
  assert.deepEqual(computeCommission(10.05, 0.07), { rate: 0.07, base: 10.05, amount: 0.7, technicianShare: 9.35 });
  assert.deepEqual(computeCommission(1.005, 0.1), { rate: 0.1, base: 1.01, amount: 0.1, technicianShare: 0.91 });
  assert.equal(computeCommission(100, 9).rate, 0.07, 'invalid rate -> default');
  assert.deepEqual(parseAmountCollected(undefined, 180), { value: 180 });
  assert.deepEqual(parseAmountCollected('', 180), { value: 180 });
  assert.deepEqual(parseAmountCollected('1,250.5', 0), { value: 1250.5 });
  assert.ok(parseAmountCollected(-1, 0).error);
  assert.ok(parseAmountCollected('1e3', 0).error);
});

test('settlement balance: due = commission of completed jobs - settlements', async () => {
  assert.deepEqual(
    (({ commissionTotal, commissionPaid, commissionDue }) => ({ commissionTotal, commissionPaid, commissionDue }))(technicianStats.shapeStats({ commissionTotal: 50.3 }, 20.1)),
    { commissionTotal: 50.3, commissionPaid: 20.1, commissionDue: 30.2 }
  );
  const saved = { bAgg: Booking.aggregate, sAgg: CommissionSettlement.aggregate };
  let bookingPipeline;
  Booking.aggregate = async (p) => { bookingPipeline = p; return [{ _id: TECH, commissionTotal: 35, completedTotal: 3, activeJobs: 1, activeJobId: 'x1', earningsToday: 93, earningsMonth: 465 }]; };
  CommissionSettlement.aggregate = async () => [{ _id: TECH, paid: 12.5 }];
  try {
    const stats = (await realStatsFor([TECH])).get(TECH);
    assert.equal(stats.commissionDue, 22.5);
    assert.equal(stats.commissionPaid, 12.5);
    assert.equal(stats.completedTotal, 3);
    assert.equal(stats.activeJobId, 'x1');
    assert.equal(bookingPipeline[0].$match.deletedAt, null, 'deleted bookings never count');
    assert.equal(String(bookingPipeline[0].$match.technician.$in[0]), TECH);
    assert.equal(bookingPipeline[0].$match.technician.$in[0]._bsontype, 'ObjectId', 'string ids are cast for aggregate()');
  } finally {
    Booking.aggregate = saved.bAgg;
    CommissionSettlement.aggregate = saved.sAgg;
  }
});

test('admin technician input validation (create and edit)', () => {
  const p = adminTech.parseTechnicianInput;
  const good = { fullName: 'Ali Hassan', phone: '0551234567', password: 'longpass1', cities: ['jeddah'], specialties: ['ac'], autoAssign: true };
  const ok = p(good);
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.values, { fullName: 'Ali Hassan', phone: '+966551234567', password: 'longpass1', cities: ['jeddah'], specialties: ['ac'], autoAssign: true, active: true, availability: true });
  for (const [label, bad] of [
    ['name', { fullName: 'A' }], ['phone', { phone: '+923001234567' }], ['short password', { password: 'short7!' }],
    ['long password', { password: 'x'.repeat(73) }], ['city', { cities: ['riyadh'] }], ['cities type', { cities: 'jeddah' }],
    ['specialty', { specialties: ['freezer'] }], ['autoAssign type', { autoAssign: 'yes' }], ['email', { email: 'nope' }],
  ]) assert.ok(p({ ...good, ...bad }).error, label);
  assert.ok(p({ ...good, password: undefined }).error, 'password required on create');

  assert.ok(p({}, { partial: true }).error, 'empty edit');
  assert.deepEqual(p({ availability: false }, { partial: true }).values, { availability: false });
  assert.deepEqual(p({ email: '' }, { partial: true }).values, { email: null }, 'edit can clear the email');
  assert.deepEqual(p({ cities: ['makkah', 'makkah'] }, { partial: true }).values, { cities: ['makkah'] }, 'deduplicated');
  assert.ok(p({ password: 'short' }, { partial: true }).error);
});

// ---------------------------------------------------------------------------------------------------------------
// HTTP: admin technician routes + technician app routes (models replaced by in-memory stand-ins)
// ---------------------------------------------------------------------------------------------------------------
const saved = {};
let server; let base;
let users; let profiles; let audits; let findCalls; let created; let settlements;
const call = async (method, path, who, body) => {
  const res = await fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${token(who)}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const matchUser = (u, f) => Object.entries(f).every(([k, c]) => {
  if (c && typeof c === 'object' && '$in' in c) return c.$in.map(String).includes(String(u[k]));
  if (c && typeof c === 'object' && '$ne' in c) return String(u[k]) !== String(c.$ne);
  return String(u[k]) === String(c);
});

test.before(async () => {
  Object.assign(saved, {
    uFindById: User.findById, uFindOne: User.findOne, uFind: User.find, uSave: User.prototype.save,
    tFindOne: Technician.findOne, tFind: Technician.find, tCreate: Technician.create, tFoau: Technician.findOneAndUpdate,
    bFind: Booking.find, bFindOne: Booking.findOne, bCount: Booking.countDocuments,
    sCreate: CommissionSettlement.create, sFind: CommissionSettlement.find, statsFor: technicianStats.statsFor,
    audit: AuditLog.create, settingFindOne: AppSetting.findOne,
  });
  User.findById = (id) => chain(() => { const u = users.find((x) => String(x._id) === String(id)) || accounts[String(id)]; return u ? User.hydrate(u) : null; });
  User.findOne = (f) => chain(() => users.find((u) => matchUser(u, f)) || null);
  User.find = (f) => chain(() => users.filter((u) => matchUser(u, f)));
  User.prototype.save = async function () { created.user = this; users.push({ ...this.toObject(), _id: this._id }); return this; };
  Technician.findOne = (f) => chain(() => profiles.find((p) => String(p.user) === String(f.user)) || null);
  Technician.find = () => chain(() => profiles);
  Technician.create = async (data) => { created.profile = data; profiles.push(data); return { ...data, toObject: () => data }; };
  Technician.findOneAndUpdate = (f, u) => chain(() => {
    const p = profiles.find((x) => String(x.user) === String(f.user));
    if (!p) return null;
    Object.assign(p, u.$set);
    return p;
  });
  CommissionSettlement.create = async (data) => { settlements.push(data); return { ...data, toObject: () => data }; };
  CommissionSettlement.find = () => chain(() => settlements);
  technicianStats.statsFor = async (ids) => new Map(ids.map((id) => [String(id), technicianStats.shapeStats({ commissionTotal: 40 }, settlements.reduce((s, x) => s + x.amount, 0))]));
  AuditLog.create = async (entry) => { audits.push(entry); return entry; };
  AppSetting.findOne = () => chain(null);
  Booking.find = (f) => { findCalls.push(['find', f]); return chain([]); };
  Booking.countDocuments = async (f) => { findCalls.push(['count', f]); return 0; };
  Booking.findOne = (f) => { findCalls.push(['findOne', f]); return chain(null); };

  const app = express();
  app.use(express.json());
  app.use(rejectMongoOperators);
  app.use('/api/admin', adminRouter);
  app.use('/api/technician', technicianRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  Object.assign(User, { findById: saved.uFindById, findOne: saved.uFindOne, find: saved.uFind });
  User.prototype.save = saved.uSave;
  Object.assign(Technician, { findOne: saved.tFindOne, find: saved.tFind, create: saved.tCreate, findOneAndUpdate: saved.tFoau });
  Object.assign(Booking, { find: saved.bFind, findOne: saved.bFindOne, countDocuments: saved.bCount });
  Object.assign(CommissionSettlement, { create: saved.sCreate, find: saved.sFind });
  technicianStats.statsFor = saved.statsFor;
  AuditLog.create = saved.audit;
  AppSetting.findOne = saved.settingFindOne;
});
test.beforeEach(() => {
  users = [{ ...accounts[ADMIN] }, { ...accounts[TECH] }];
  profiles = [{ user: TECH, cities: ['jeddah'], skills: ['ac'], autoAssign: true, active: true, availability: true }];
  audits = []; findCalls = []; created = {}; settlements = [];
});

test('admin creates a technician: verified phone account + profile; duplicates are 409; bad input 400', async () => {
  const body = { fullName: 'New Tech', phone: '0561112222', password: 'password123', cities: ['makkah'], specialties: [], autoAssign: true };
  const res = await call('POST', '/admin/technicians', ADMIN, body);
  assert.equal(res.status, 201);
  assert.equal(res.json.technician.phone, '+966561112222');
  assert.deepEqual(res.json.technician.cities, ['makkah']);
  assert.equal(res.json.technician.autoAssign, true);
  assert.equal(res.json.technician.active, true);
  assert.equal(res.json.technician.stats.commissionDue, 0);
  assert.equal(created.user.role, 'technician');
  assert.equal(created.user.authProvider, 'phone');
  assert.equal(created.user.isVerified, true);
  assert.equal(created.user.isPhoneVerified, true);
  assert.equal(created.profile.autoAssign, true);
  assert.ok(!JSON.stringify(audits).includes('password123'), 'the password never reaches the audit log');

  assert.equal((await call('POST', '/admin/technicians', ADMIN, { ...body, phone: '+966 56 111 2222' })).status, 409, 'same phone, other spelling');
  assert.equal((await call('POST', '/admin/technicians', ADMIN, { ...body, password: 'short' })).status, 400);
  assert.equal((await call('POST', '/admin/technicians', ADMIN, { ...body, cities: ['dammam'] })).status, 400);
  assert.equal((await call('POST', '/admin/technicians', TECH, body)).status, 403, 'admin only');
});

test('admin edits a technician: toggles, 404 for non-technicians, 409 for a taken phone', async () => {
  const res = await call('PATCH', `/admin/technicians/${TECH}`, ADMIN, { autoAssign: false, availability: false, cities: ['jeddah', 'makkah'] });
  assert.equal(res.status, 200);
  assert.equal(res.json.technician.autoAssign, false);
  assert.equal(res.json.technician.availability, false);
  assert.deepEqual(profiles[0].cities, ['jeddah', 'makkah']);
  assert.equal((await call('PATCH', `/admin/technicians/${ADMIN}`, ADMIN, { active: false })).status, 404, 'not a technician');
  assert.equal((await call('PATCH', `/admin/technicians/${TECH}`, ADMIN, {})).status, 400);
  users.push({ _id: OTHER_TECH, role: 'customer', phone: '+966570000000' });
  assert.equal((await call('PATCH', `/admin/technicians/${TECH}`, ADMIN, { phone: '0570000000' })).status, 409);
});

test('admin records a settlement; the balance goes down; invalid amounts are refused', async () => {
  const res = await call('POST', `/admin/technicians/${TECH}/settlements`, ADMIN, { amount: 15.5, method: 'bank_transfer', note: 'Week 42' });
  assert.equal(res.status, 201);
  assert.equal(res.json.commissionDue, 24.5);
  assert.equal(settlements[0].amount, 15.5);
  assert.equal(String(settlements[0].createdBy), ADMIN);
  for (const bad of [{ amount: 0 }, { amount: -5 }, { amount: 'x' }, { amount: 5, method: 'crypto' }]) {
    assert.equal((await call('POST', `/admin/technicians/${TECH}/settlements`, ADMIN, bad)).status, 400, JSON.stringify(bad));
  }
  const list = await call('GET', `/admin/technicians/${TECH}/settlements`, ADMIN);
  assert.equal(list.json.settlements.length, 1);
  assert.equal(list.json.commissionDue, 24.5);
});

test('technician app: only technicians, and every job query is scoped to the caller', async () => {
  assert.equal((await call('GET', '/technician/jobs', ADMIN)).status, 403);
  assert.equal((await call('GET', '/technician/jobs')).status, 401);
  for (const scope of ['active', 'today', 'upcoming', 'completed']) {
    findCalls = [];
    const res = await call('GET', `/technician/jobs?scope=${scope}`, TECH);
    assert.equal(res.status, 200, scope);
    assert.deepEqual(Object.keys(res.json.counts), ['active', 'today', 'upcoming', 'completed']);
    assert.ok(findCalls.length >= 2);
    for (const [, filter] of findCalls) {
      assert.equal(String(filter.technician), TECH, `${scope}: scoped to the technician`);
      assert.equal(filter.deletedAt, null);
    }
  }
  assert.equal((await call('GET', '/technician/jobs?scope=everything', TECH)).status, 400);

  findCalls = [];
  assert.equal((await call('GET', '/technician/jobs/507f1f77bcf86cd799439099', TECH)).status, 404, 'not theirs (or missing)');
  assert.equal(String(findCalls[0][1].technician), TECH);
  assert.equal((await call('GET', '/technician/jobs/not-an-id', TECH)).status, 404);
});

test('technician app: job shape, availability switch and /me', async () => {
  const { shapeJob, scopeFilter } = technicianRouter.helpers;
  const job = shapeJob({ _id: 'j1', orderNumber: 'ORD-1', status: 'assigned', service: { name: 'AC', name_ar: 'مكيف', category: 'ac' }, customerName: 'C', phone: '+966500000000', address: 'Addr', coordinates: { latitude: 21.5, longitude: 39.2 }, totalAmount: 180, commission: {}, completion: {} });
  assert.deepEqual(job.service, { name: 'AC', nameAr: 'مكيف', category: 'ac' });
  assert.deepEqual(job.coordinates, { latitude: 21.5, longitude: 39.2 });
  assert.equal(job.commission, null);
  assert.equal(job.completion, null);
  const today = scopeFilter(TECH, 'today', '2026-10-17');
  assert.deepEqual(today.status, { $in: ['assigned', 'on_the_way', 'in_progress'] });
  assert.deepEqual(scopeFilter(TECH, 'upcoming', '2026-10-17').date, { $gt: '2026-10-17' });

  const off = await call('PUT', '/technician/availability', TECH, { availability: false });
  assert.equal(off.status, 200);
  assert.equal(profiles[0].availability, false);
  assert.equal((await call('PUT', '/technician/availability', TECH, { availability: 'no' })).status, 400);

  const me = await call('GET', '/technician/me', TECH);
  assert.equal(me.status, 200);
  assert.equal(me.json.technician.name, 'Tech One');
  assert.deepEqual(me.json.technician.cities, ['jeddah']);
  assert.equal(me.json.technician.availability, false);
  assert.equal(me.json.stats.commissionDue, 40);
  assert.equal(me.json.commissionRate, 0.07);
});
