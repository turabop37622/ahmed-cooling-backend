// Shared persistence for the WhatsApp admin inbox (models/WhatsAppMessage.js + WhatsAppConversation.js), used by
// both utils/whatsappChatbot.js (general FAQ bot + human handoff) and utils/whatsappBookingBot.js (booking
// confirm/cancel collection), so every message — whichever flow handled it — ends up in the same conversation log.
const WhatsAppMessage = require('../models/WhatsAppMessage');
const WhatsAppConversation = require('../models/WhatsAppConversation');
const whatsappCloud = require('./whatsappCloud');

const PREVIEW_LEN = 120;
const preview = (s) => String(s || '').slice(0, PREVIEW_LEN);

// Records one message and bumps the conversation's "last message" summary (creating the conversation row the
// first time this phone number is seen).
const logMessage = async (phone, direction, body, { messageType = 'text', sentBy, adminUser, customerName } = {}) => {
  // Outbound: tie the line to the message Meta just accepted, so its delivery report can update it.
  const waMessageId = direction === 'out' && messageType !== 'system' ? whatsappCloud.claimSentId(phone) : null;
  await WhatsAppMessage.create({
    phone, direction, body, messageType, sentBy, adminUser,
    ...(waMessageId ? { waMessageId, delivery: 'accepted' } : {}),
  });
  const update = { lastMessagePreview: preview(body), lastMessageAt: new Date(), lastDirection: direction };
  if (customerName) update.customerName = customerName;
  return WhatsAppConversation.findOneAndUpdate(
    { phone },
    { $set: update, $setOnInsert: { phone, status: 'bot' } },
    { upsert: true, new: true }
  );
};

// Meta's delivery report for one message we sent (webhook "statuses"). Never moves backwards (a late "sent" after
// "read"); "failed" always wins and keeps Meta's reason.
const RANK = { accepted: 0, sent: 1, delivered: 2, read: 3 };
const recordDelivery = async (status) => {
  if (!status || !status.id || !status.status) return null;
  const msg = await WhatsAppMessage.findOne({ waMessageId: status.id });
  if (!msg) return null;
  const at = new Date(Number(status.timestamp) * 1000 || Date.now());
  if (status.status === 'failed') {
    const e = (status.errors && status.errors[0]) || {};
    msg.delivery = 'failed';
    msg.deliveryAt = at;
    msg.deliveryError = { code: e.code || undefined, message: (e.error_data && e.error_data.details) || e.message || e.title || 'Not delivered' };
  } else if (RANK[status.status] !== undefined && msg.delivery !== 'failed' && RANK[status.status] > (RANK[msg.delivery] ?? -1)) {
    msg.delivery = status.status;
    msg.deliveryAt = at;
  } else {
    return msg;
  }
  await msg.save();
  return msg;
};

const getConversation = (phone) => WhatsAppConversation.findOne({ phone });

const setStatus = (phone, status) => WhatsAppConversation.findOneAndUpdate(
  { phone },
  { $set: { status, statusChangedAt: new Date() }, $setOnInsert: { phone } },
  { upsert: true, new: true }
);

const setLanguage = (phone, language) => WhatsAppConversation.findOneAndUpdate(
  { phone },
  { $set: { language }, $setOnInsert: { phone } },
  { upsert: true, new: true }
);

const markLanguagePrompted = (phone) => WhatsAppConversation.findOneAndUpdate(
  { phone },
  { $set: { languagePromptedAt: new Date() }, $setOnInsert: { phone } },
  { upsert: true, new: true }
);

module.exports = {
  recordDelivery, logMessage, getConversation, setStatus, setLanguage, markLanguagePrompted };
