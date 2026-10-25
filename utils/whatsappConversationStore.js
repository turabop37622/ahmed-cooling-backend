// Shared persistence for the WhatsApp admin inbox (models/WhatsAppMessage.js + WhatsAppConversation.js), used by
// both utils/whatsappChatbot.js (general FAQ bot + human handoff) and utils/whatsappBookingBot.js (booking
// confirm/cancel collection), so every message — whichever flow handled it — ends up in the same conversation log.
const WhatsAppMessage = require('../models/WhatsAppMessage');
const WhatsAppConversation = require('../models/WhatsAppConversation');

const PREVIEW_LEN = 120;
const preview = (s) => String(s || '').slice(0, PREVIEW_LEN);

// Records one message and bumps the conversation's "last message" summary (creating the conversation row the
// first time this phone number is seen).
const logMessage = async (phone, direction, body, { messageType = 'text', sentBy, adminUser, customerName } = {}) => {
  await WhatsAppMessage.create({ phone, direction, body, messageType, sentBy, adminUser });
  const update = { lastMessagePreview: preview(body), lastMessageAt: new Date(), lastDirection: direction };
  if (customerName) update.customerName = customerName;
  return WhatsAppConversation.findOneAndUpdate(
    { phone },
    { $set: update, $setOnInsert: { phone, status: 'bot' } },
    { upsert: true, new: true }
  );
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

module.exports = { logMessage, getConversation, setStatus, setLanguage, markLanguagePrompted };
