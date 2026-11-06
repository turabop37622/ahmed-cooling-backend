// Messages real customers sent on WhatsApp (Oct-Nov 2026) that the bot answered badly. Each test keeps one of them
// answered the way a person at the workshop would.
require('./helpers/quiet');
const test = require('node:test');
const assert = require('node:assert/strict');

const faq = require('../utils/whatsappFaq');
const { normalizeCity } = require('../utils/autoAssign');
const Booking = require('../models/Booking');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const WhatsAppConversation = require('../models/WhatsAppConversation');
const whatsappCloud = require('../utils/whatsappCloud');

const intentOf = (text) => faq.matchIntent(faq.normalize(text));

test('another country or city gets "Jeddah and Makkah only", not the price list', () => {
  assert.equal(intentOf('your service provide qatar ?'), 'other_area');
  assert.equal(intentOf('kia tum qatar ma services provide karty ho'), 'other_area');
  assert.equal(intentOf('تخدمون في الرياض؟'), 'other_area');
  // an address in Jeddah that names another place is not a question about another city
  assert.notEqual(intentOf('Riyadh street, Al Rawdah, Jeddah'), 'other_area');
  assert.match(faq.REPLIES.other_area('ur'), /Jeddah aur Makkah/);
});

test('"send number" / "technician number" get an answer instead of "I can\'t provide a phone number"', () => {
  assert.equal(intentOf('Send number'), 'contact');
  assert.equal(intentOf('Technician number'), 'tech_contact');
  assert.match(faq.REPLIES.tech_contact('en'), /call you/);
});

test('asking for our location says the technician comes to them', () => {
  assert.equal(intentOf('ممكن لوكيشن بليز عشان في ريبير حق مايكروييف هنا يجي'), 'our_location');
  assert.equal(intentOf('send me your location'), 'our_location');
  assert.match(faq.REPLIES.our_location('ar'), /المنزل/);
});

test('"it trips the power" is a symptom for the AI, not an electrical-wiring price card', () => {
  assert.ok(faq.PROBLEM_RE.test(faq.normalize('فيه قفلة كهرباء')));
  assert.ok(faq.PROBLEM_RE.test('my microwave trips the breaker'));
});

test('a voice note transcribed in Hindi letters is recognised (it is answered in Roman Urdu)', () => {
  assert.ok(faq.isDevanagari('जड़ा मैसे ते हमारा दा लोकेशन'));
  assert.ok(!faq.isDevanagari('meri fridge kharab hai'));
});

test('"jedah" is Jeddah', () => {
  assert.equal(normalizeCity('In jedah i swear'), 'jeddah');
});

// The menu with its sends stubbed: what the customer would get back.
const withMenu = async (fn) => {
  const cloud = require('../utils/whatsappCloud');
  const store = require('../utils/whatsappConversationStore');
  const saved = { list: cloud.sendListMessage, buttons: cloud.sendButtonsMessage, text: cloud.sendTextMessage, log: store.logMessage, lang: store.setLanguage };
  const sent = []; const state = { language: null };
  cloud.sendListMessage = async (to, body) => { sent.push({ kind: 'list', body }); };
  cloud.sendButtonsMessage = async (to, body, buttons) => { sent.push({ kind: 'buttons', body, buttons }); };
  cloud.sendTextMessage = async (to, body) => { sent.push({ kind: 'text', body }); };
  store.logMessage = async () => {};
  store.setLanguage = async (phone, lang) => { state.language = lang; };
  delete require.cache[require.resolve('../utils/whatsappMenu')];
  try {
    await fn(require('../utils/whatsappMenu'), sent, state);
  } finally {
    cloud.sendListMessage = saved.list; cloud.sendButtonsMessage = saved.buttons; cloud.sendTextMessage = saved.text;
    store.logMessage = saved.log; store.setLanguage = saved.lang;
    delete require.cache[require.resolve('../utils/whatsappMenu')];
  }
};

test('an English "Hello" gets the welcome and the menu at once, not a "choose your language" question', async () => {
  await withMenu(async (menu, sent, state) => {
    assert.equal(await menu.handle('966500000001', 'Hello', {}), true);
    assert.equal(state.language, 'en');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].kind, 'list');
    assert.match(sent[0].body, /Welcome to Ahmed Cooling Workshop/);
    assert.doesNotMatch(sent[0].body, /choose your language/i);
  });
});

test('a Roman Urdu question about Qatar is answered in Roman Urdu', async () => {
  await withMenu(async (menu, sent) => {
    assert.equal(await menu.handle('966500000002', 'kia tum qatar ma services provide karty ho', { language: 'en' }), true);
    assert.match(sent[0].body, /sirf Jeddah aur Makkah/);
  });
});

test('"yes, but only on Tuesday, Friday and Saturday" to the confirmation is noted on the booking and handed to the team', async () => {
  const booking = { _id: 'b1', orderNumber: 'ORD-1', language: 'ar', phone: '+966500000003', whatsappBot: { confirmationSentAt: new Date() } };
  const saved = {
    findOne: Booking.findOne, updateOne: Booking.updateOne, send: whatsappCloud.sendTextMessage,
    create: WhatsAppMessage.create, conv: WhatsAppConversation.findOneAndUpdate,
  };
  const updates = []; const sent = []; const statuses = [];
  Booking.findOne = () => ({ sort: async () => booking });
  Booking.updateOne = async (q, u) => { updates.push(u); };
  whatsappCloud.sendTextMessage = async (to, body) => { sent.push(body); };
  WhatsAppMessage.create = async () => ({});
  WhatsAppConversation.findOneAndUpdate = async (q, u) => { if (u.$set && u.$set.status) statuses.push(u.$set.status); return { phone: q.phone }; };
  try {
    const bot = require('../utils/whatsappBookingBot');
    assert.equal(await bot.handleBookingNote('+966500000003', 'نعم لكن متواجد فقط يوم الثلاثاء وجمعه وسبت'), true);
    assert.equal(updates[0].$set['whatsappBot.customerReply'], 'note');
    assert.match(updates[0].$set['whatsappBot.customerReplyReason'], /الثلاثاء/);
    assert.deepEqual(statuses, ['needs_human']);
    assert.match(sent[0], /ORD-1/);
    assert.match(sent[0], /فريقنا/);
    // a plain question is not a note, and a plain "yes" stays the normal confirmation
    assert.equal(await bot.handleBookingNote('+966500000003', 'how much is ac cleaning'), false);
    assert.equal(await bot.handleBookingNote('+966500000003', 'نعم'), false);
  } finally {
    Booking.findOne = saved.findOne; Booking.updateOne = saved.updateOne; whatsappCloud.sendTextMessage = saved.send;
    WhatsAppMessage.create = saved.create; WhatsAppConversation.findOneAndUpdate = saved.conv;
  }
});

test('a location pin sent after booking goes onto the booking instead of "I can only read text"', async () => {
  const booking = { _id: 'b2', orderNumber: 'ORD-2' };
  const saved = {
    findOne: Booking.findOne, updateOne: Booking.updateOne, send: whatsappCloud.sendTextMessage,
    create: WhatsAppMessage.create, conv: WhatsAppConversation.findOneAndUpdate,
  };
  const updates = []; const sent = [];
  Booking.findOne = () => ({ sort: async () => booking });
  Booking.updateOne = async (q, u) => { updates.push(u); };
  whatsappCloud.sendTextMessage = async (to, body) => { sent.push(body); };
  WhatsAppMessage.create = async () => ({});
  WhatsAppConversation.findOneAndUpdate = async () => ({});
  try {
    const media = require('../utils/whatsappMedia');
    assert.equal(await media.handleLocation('+966500000004', { latitude: 21.54, longitude: 39.17 }, false), true);
    assert.deepEqual(updates[0].$set.coordinates, { latitude: 21.54, longitude: 39.17 });
    assert.match(sent[0], /ORD-2/);
  } finally {
    Booking.findOne = saved.findOne; Booking.updateOne = saved.updateOne; whatsappCloud.sendTextMessage = saved.send;
    WhatsAppMessage.create = saved.create; WhatsAppConversation.findOneAndUpdate = saved.conv;
  }
});

test('replies go out only in English, Arabic or Roman Urdu: a Hindi-script answer is asked for again, never sent', async () => {
  const axios = require('axios');
  const saved = {
    key: process.env.GROQ_API_KEY, post: axios.post, buttons: whatsappCloud.sendButtonsMessage, text: whatsappCloud.sendTextMessage,
    find: WhatsAppMessage.find, create: WhatsAppMessage.create, bfind: Booking.find, conv: WhatsAppConversation.findOneAndUpdate,
  };
  process.env.GROQ_API_KEY = 'test-key';
  delete require.cache[require.resolve('../utils/whatsappChatbot')];
  const answers = ['हमारा टेक्नीशियन आपके घर आएगा', 'Ji, hamara technician aap ke ghar aayega.'];
  const prompts = []; const sent = [];
  axios.post = async (url, body) => { prompts.push(body.messages[0].content); return { data: { choices: [{ message: { content: answers.shift() } }] } }; };
  whatsappCloud.sendButtonsMessage = async (to, body) => { sent.push(body); };
  whatsappCloud.sendTextMessage = async (to, body) => { sent.push(body); };
  WhatsAppMessage.find = () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) });
  WhatsAppMessage.create = async () => ({});
  Booking.find = () => ({ sort: () => ({ limit: () => ({ select: () => ({ lean: async () => [] }) }) }) });
  WhatsAppConversation.findOneAndUpdate = async () => ({});
  try {
    const chatbot = require('../utils/whatsappChatbot');
    await chatbot.handleIncomingText('+966500000005', 'जड़ा मैसे ते हमारा दा लोकेशन', { status: 'bot', language: 'en' });
    assert.equal(prompts.length, 2);
    assert.match(prompts[1], /ONLY in English, Arabic or Roman Urdu/);
    assert.deepEqual(sent, ['Ji, hamara technician aap ke ghar aayega.']);
  } finally {
    if (saved.key === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = saved.key;
    axios.post = saved.post; whatsappCloud.sendButtonsMessage = saved.buttons; whatsappCloud.sendTextMessage = saved.text;
    WhatsAppMessage.find = saved.find; WhatsAppMessage.create = saved.create; Booking.find = saved.bfind;
    WhatsAppConversation.findOneAndUpdate = saved.conv;
    delete require.cache[require.resolve('../utils/whatsappChatbot')];
  }
});

test('Urdu script is not taken for Arabic', () => {
  assert.ok(faq.isUrduScript('میرا فریج ٹھنڈا نہیں کر رہا ہے'));
  assert.ok(!faq.isUrduScript('الثلاجة لا تبرد'));
});

test('an account deletion request (sent from the website\'s deletion page) goes straight to a person', () => {
  const chatbot = require('../utils/whatsappChatbot');
  assert.ok(chatbot.isHandoffRequest('I would like to delete my Ahmed Cooling app account.'));
  assert.ok(chatbot.isHandoffRequest('أرغب في حذف حسابي في تطبيق أحمد للتبريد.'));
  assert.ok(!chatbot.isHandoffRequest('how much is ac cleaning'));
});
