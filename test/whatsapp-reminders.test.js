require('./helpers/quiet');
const test = require('node:test');
const assert = require('node:assert/strict');

const Booking = require('../models/Booking');
const whatsappCloud = require('../utils/whatsappCloud');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const WhatsAppConversation = require('../models/WhatsAppConversation');
const bot = require('../utils/whatsappBookingBot');

// In-memory stand-in for the few query shapes the reminder pass uses: equality, null, $exists, $lte on dotted paths.
const at = (doc, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
const matches = (doc, q) => Object.entries(q).every(([k, v]) => {
  const val = at(doc, k);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('$exists' in v) return v.$exists ? val !== undefined : val === undefined;
    if ('$lte' in v) return val !== undefined && val <= v.$lte;
  }
  if (v === null) return val == null;
  return String(val) === String(v);
});

test('no answer: the confirmation is sent again after 2 hours and after 12 hours, then never again', async () => {
  const saved = { find: Booking.find, fou: Booking.findOneAndUpdate, send: whatsappCloud.sendTemplateMessage, create: WhatsAppMessage.create, conv: WhatsAppConversation.findOneAndUpdate };
  const H = 3600000;
  const db = [];
  const sent = [];
  Booking.find = (q) => ({ limit: async () => db.filter((d) => matches(d, q)) });
  Booking.findOneAndUpdate = async (q, upd) => {
    const d = db.find((x) => matches(x, q));
    if (!d) return null;
    for (const [k, v] of Object.entries(upd.$set)) { const p = k.split('.'); p.slice(0, -1).reduce((o, kk) => o[kk], d)[p.at(-1)] = v; }
    return d;
  };
  whatsappCloud.sendTemplateMessage = async (to) => { sent.push(to); };
  WhatsAppMessage.create = async () => ({});
  WhatsAppConversation.findOneAndUpdate = async () => ({});
  const make = (id, hoursAgo, extra = {}) => ({
    _id: id, status: 'pending', deletedAt: null, phone: '+966565635279', orderNumber: id, customerName: 'Aqeel', date: '2026-11-02', time: 'Anytime',
    whatsappBot: { confirmationSentAt: new Date(Date.now() - hoursAgo * H), unconfirmedAlertedAt: new Date(), ...extra },
  });
  try {
    db.push(make('fresh', 1));
    db.push(make('two-hours', 2.1));
    db.push(make('answered', 13, { customerReply: 'confirm' }));
    db.push(make('twelve-hours', 12.1, { reminderSentAt: new Date(Date.now() - 10 * H) }));
    db.push(make('done', 30, { reminderSentAt: new Date(), secondReminderSentAt: new Date() }));
    await bot.chaseUnanswered();
    assert.equal(sent.length, 2, 'one reminder each for the 2-hour and the 12-hour booking');
    const bot_ = (id) => db.find((d) => d._id === id).whatsappBot;
    assert.ok(bot_('two-hours').reminderSentAt, 'first reminder at 2 hours');
    assert.ok(bot_('twelve-hours').secondReminderSentAt, 'second reminder at 12 hours');
    assert.equal(bot_('fresh').reminderSentAt, undefined, 'not yet at 1 hour');
    assert.equal(bot_('answered').reminderSentAt, undefined, 'customer already answered');
    assert.equal(db.find((d) => d._id === 'two-hours').whatsappBot.secondReminderSentAt, undefined);
    await bot.chaseUnanswered();
    assert.equal(sent.length, 2, 'nothing is sent twice');
  } finally {
    Object.assign(Booking, { find: saved.find, findOneAndUpdate: saved.fou });
    whatsappCloud.sendTemplateMessage = saved.send; WhatsAppMessage.create = saved.create; WhatsAppConversation.findOneAndUpdate = saved.conv;
  }
});
