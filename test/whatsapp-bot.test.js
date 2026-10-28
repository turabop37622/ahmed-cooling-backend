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

test('the bot never states a service duration or a warranty', () => {
  const text = [
    faq.serviceReply(catalogue.slice(0, catalogue.length), 'en'), faq.serviceReply(catalogue, 'ar'),
    faq.servicesOverview('en'), faq.REPLIES.warranty('en'), faq.REPLIES.arrival('en'), faq.REPLIES.arrival('ar'),
  ].join('\n');
  assert.doesNotMatch(text, /-day warranty|about \d|\d+ ?hours|\d+ ?minutes|المدة|ضمان \d/i);
});

test('a template approved under the other English code (en / en_US) is retried once with it', async () => {
  process.env.WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || 'test-id';
  process.env.WHATSAPP_CLOUD_API_TOKEN = process.env.WHATSAPP_CLOUD_API_TOKEN || 'test-token';
  const axios = require('axios');
  const realPost = axios.post;
  const codes = [];
  axios.post = async (url, payload) => {
    codes.push(payload.template.language.code);
    if (payload.template.language.code === 'en_US') {
      const err = new Error('template not found'); err.response = { data: { error: { code: 132001 } } }; throw err;
    }
    return { data: { messages: [{ id: 'x' }] } };
  };
  try {
    delete require.cache[require.resolve('../utils/whatsappCloud')];
    const cloud = require('../utils/whatsappCloud');
    await cloud.sendTemplateMessage('966500000001', 'booking_on_the_way', 'en_US', []);
    assert.deepEqual(codes, ['en_US', 'en']);
  } finally {
    axios.post = realPost;
    delete require.cache[require.resolve('../utils/whatsappCloud')];
  }
});

test('a template Meta refuses is remembered for the admin panel, with Meta\'s code and reason', async () => {
  process.env.WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || 'test-id';
  process.env.WHATSAPP_CLOUD_API_TOKEN = process.env.WHATSAPP_CLOUD_API_TOKEN || 'test-token';
  const axios = require('axios');
  const realPost = axios.post;
  axios.post = async () => {
    const err = new Error('Request failed with status code 400');
    err.response = { data: { error: { code: 131042, message: 'Business eligibility payment issue' } } };
    throw err;
  };
  try {
    delete require.cache[require.resolve('../utils/whatsappCloud')];
    const cloud = require('../utils/whatsappCloud');
    await assert.rejects(cloud.sendTemplateMessage('966500000001', 'booking_confirmation', 'en_US', []));
    const log = cloud.getTemplateLog();
    assert.equal(log.lastError.code, 131042);
    assert.equal(log.lastError.template, 'booking_confirmation');
    assert.match(log.lastError.message, /payment/);
  } finally {
    axios.post = realPost;
    delete require.cache[require.resolve('../utils/whatsappCloud')];
  }
});

test('a "failed" delivery report from Meta is kept for the admin panel', () => {
  const cloud = require('../utils/whatsappCloud');
  cloud.recordDeliveryFailure({ status: 'failed', recipient_id: '966500000001', timestamp: String(Math.floor(Date.now() / 1000)), errors: [{ code: 131026, title: 'Message undeliverable' }] });
  const u = cloud.getTemplateLog().lastUndelivered;
  assert.equal(u.code, 131026);
  assert.equal(u.to, '966500000001');
  assert.match(u.message, /undeliverable/i);
});

test('an Arabic salaam gets the Arabic menu straight away instead of the language question', async () => {
  const cloud = require('../utils/whatsappCloud');
  const store = require('../utils/whatsappConversationStore');
  const saved = { list: cloud.sendListMessage, buttons: cloud.sendButtonsMessage, log: store.logMessage, lang: store.setLanguage };
  const sent = []; let language = null;
  cloud.sendListMessage = async (to, body) => { sent.push({ kind: 'list', body }); };
  cloud.sendButtonsMessage = async (to, body) => { sent.push({ kind: 'buttons', body }); };
  store.logMessage = async () => {};
  store.setLanguage = async (phone, lang) => { language = lang; };
  try {
    delete require.cache[require.resolve('../utils/whatsappMenu')];
    const menu = require('../utils/whatsappMenu');
    const conversation = {};
    assert.equal(await menu.handle('966546904306', 'السلام عليكم ورحمة الله وبركاته', conversation), true);
    assert.equal(language, 'ar');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].kind, 'list');
    assert.match(sent[0].body, /وعليكم السلام/);
  } finally {
    cloud.sendListMessage = saved.list; cloud.sendButtonsMessage = saved.buttons; store.logMessage = saved.log; store.setLanguage = saved.lang;
    delete require.cache[require.resolve('../utils/whatsappMenu')];
  }
});
