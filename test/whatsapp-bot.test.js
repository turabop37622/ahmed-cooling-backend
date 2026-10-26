require('./helpers/quiet');
const test = require('node:test');
const assert = require('node:assert/strict');
const flow = require('../utils/whatsappBookingFlow');
const faq = require('../utils/whatsappFaq');
const catalogue = require('../web/src/lib/services.json');

test('every service can be booked from WhatsApp: groups cover the catalogue and a list never exceeds 10 rows', () => {
  const reachable = new Set();
  for (const group of flow.SERVICE_GROUPS) {
    const rows = flow.groupServices(group);
    assert.ok(rows.length > 0 && rows.length <= 10, `${group.key} has ${rows.length} rows`);
    for (const { index } of rows) reachable.add(index);
  }
  assert.equal(flow.SERVICE_GROUPS.length <= 10, true);
  assert.equal(reachable.size, catalogue.length);
});

test('a tap or an on-topic word answers the open question; a greeting or a sentence about something else does not', () => {
  assert.equal(flow.looksLikeAnswer('service', 'cat_ac'), true);
  assert.equal(flow.looksLikeAnswer('service', 'svc_3'), true);
  assert.equal(flow.looksLikeAnswer('date', 'tomorrow'), true);
  assert.equal(flow.looksLikeAnswer('date', '15/11'), true);
  assert.equal(flow.looksLikeAnswer('time', 'evening'), true);
  assert.equal(flow.looksLikeAnswer('confirm', 'yes'), true);
  assert.equal(flow.looksLikeAnswer('date', 'hello'), false);
  assert.equal(flow.looksLikeAnswer('time', 'how much is a gas refill'), false);
  assert.equal(flow.looksLikeAnswer('address', ''), false);
});

test('Roman Urdu is detected only with two Urdu words and no Arabic script', () => {
  assert.equal(faq.isRomanUrdu('meri fridge cooling nahi kar rahi'), true);
  assert.equal(faq.isRomanUrdu('fridge repair'), false);
  assert.equal(faq.isRomanUrdu('ثلاجتي لا تبرد'), false);
});

test('problem descriptions are recognised so they reach the AI instead of the price card', () => {
  assert.ok(faq.PROBLEM_RE.test('my fridge is not cooling'));
  assert.ok(!faq.PROBLEM_RE.test('AC repair'));
});

test('cancelling from WhatsApp runs the app cancel code for the customer\'s own open booking only', async () => {
  const Booking = require('../models/Booking');
  const cloud = require('../utils/whatsappCloud');
  const store = require('../utils/whatsappConversationStore');
  const bookingsRouter = require('../routes/bookings');
  const sent = [];
  const saved = { findOne: Booking.findOne, buttons: cloud.sendButtonsMessage, text: cloud.sendTextMessage, log: store.logMessage, cancel: bookingsRouter.cancelForOwner };
  const id = '507f1f77bcf86cd799439016';
  let cancelled = null;
  Booking.findOne = async (q) => (String(q._id) === id ? { _id: id, user: 'u1', orderNumber: 'ORD-1', date: '2030-01-01', time: '10:00 AM', status: 'pending' } : null);
  cloud.sendButtonsMessage = async (to, body, buttons) => { sent.push({ body, ids: buttons.map((b) => b.id) }); };
  cloud.sendTextMessage = async (to, text) => { sent.push({ body: text, ids: [] }); };
  store.logMessage = async () => {};
  bookingsRouter.cancelForOwner = async (req, res, booking) => { cancelled = { user: req.user, id: booking._id }; return res.json({ success: true }); };
  try {
    delete require.cache[require.resolve('../utils/whatsappManage')];
    const manage = require('../utils/whatsappManage');
    await manage.handleTap('966512345678', `menu_mbc_${id}`, false);
    assert.deepEqual(sent[0].ids, [`menu_mby_${id}`, `menu_mb_${id}`]);
    assert.equal(cancelled, null, 'asking must not cancel');
    await manage.handleTap('966512345678', `menu_mby_${id}`, false);
    assert.deepEqual(cancelled, { user: { id: 'u1', role: 'customer' }, id });
    await manage.handleTap('966512345678', 'menu_mby_507f1f77bcf86cd799439099', false); // someone else's / unknown
    assert.match(sent[sent.length - 1].body, /no longer be changed/);
  } finally {
    Booking.findOne = saved.findOne; cloud.sendButtonsMessage = saved.buttons; cloud.sendTextMessage = saved.text;
    store.logMessage = saved.log; bookingsRouter.cancelForOwner = saved.cancel;
    delete require.cache[require.resolve('../utils/whatsappManage')];
  }
});

test('a short Roman Urdu question about another country counts as Roman Urdu', () => {
  assert.equal(faq.isRomanUrdu('kia tum qatar ma services provide karty ho >'), true);
  assert.equal(faq.isRomanUrdu('AC repair price'), false);
});
