require('./helpers/quiet');
const test = require('node:test');
const assert = require('node:assert/strict');

const WhatsAppMessage = require('../models/WhatsAppMessage');
const WhatsAppConversation = require('../models/WhatsAppConversation');
const whatsappCloud = require('../utils/whatsappCloud');
const store = require('../utils/whatsappConversationStore');

test('an outbound log line takes the id Meta gave that send; inbound and other numbers do not', async () => {
  const saved = { create: WhatsAppMessage.create, upsert: WhatsAppConversation.findOneAndUpdate };
  const rows = [];
  WhatsAppMessage.create = async (d) => { rows.push(d); return d; };
  WhatsAppConversation.findOneAndUpdate = async () => ({});
  try {
    whatsappCloud.rememberSent('966500000001', 'wamid.A');
    whatsappCloud.rememberSent('966500000001', 'wamid.B');
    await store.logMessage('+966500000002', 'out', 'other number', { sentBy: 'bot' });
    await store.logMessage('+966500000001', 'in', 'hello');
    await store.logMessage('+966500000001', 'out', 'first', { messageType: 'template', sentBy: 'bot' });
    await store.logMessage('+966500000001', 'out', 'second', { sentBy: 'bot' });
    await store.logMessage('+966500000001', 'out', 'nothing left', { sentBy: 'bot' });
    assert.deepEqual(rows.map((r) => [r.body, r.waMessageId || null, r.delivery || null]), [
      ['other number', null, null], ['hello', null, null],
      ['first', 'wamid.A', 'accepted'], ['second', 'wamid.B', 'accepted'], ['nothing left', null, null],
    ]);
  } finally {
    WhatsAppMessage.create = saved.create; WhatsAppConversation.findOneAndUpdate = saved.upsert;
  }
});

test('delivery reports move forward only; failed keeps Meta\'s reason', async () => {
  const saved = WhatsAppMessage.findOne;
  const msg = { waMessageId: 'wamid.X', delivery: 'accepted', saves: 0, async save() { this.saves += 1; } };
  WhatsAppMessage.findOne = async (q) => (q.waMessageId === 'wamid.X' ? msg : null);
  try {
    await store.recordDelivery({ id: 'wamid.X', status: 'sent', timestamp: '1700000000' });
    assert.equal(msg.delivery, 'sent');
    await store.recordDelivery({ id: 'wamid.X', status: 'read', timestamp: '1700000060' });
    assert.equal(msg.delivery, 'read');
    await store.recordDelivery({ id: 'wamid.X', status: 'delivered', timestamp: '1700000030' }); // arrives late
    assert.equal(msg.delivery, 'read', 'never moves backwards');
    assert.equal(msg.saves, 2);
    await store.recordDelivery({ id: 'wamid.X', status: 'failed', timestamp: '1700000090', errors: [{ code: 131042, title: 'Business eligibility payment issue', error_data: { details: 'Message failed to send because there were one or more errors related to your payment method.' } }] });
    assert.equal(msg.delivery, 'failed');
    assert.equal(msg.deliveryError.code, 131042);
    assert.match(msg.deliveryError.message, /payment method/);
    assert.equal(await store.recordDelivery({ id: 'wamid.unknown', status: 'sent' }), null);
  } finally {
    WhatsAppMessage.findOne = saved;
  }
});
