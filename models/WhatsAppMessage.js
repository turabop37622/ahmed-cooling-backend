const mongoose = require('mongoose');

// One row per WhatsApp message (inbound from a customer, or outbound from the bot or an admin), keyed by the
// customer's phone number. This is the only persistent record of a WhatsApp conversation now that the number
// is not also sitting in a phone's WhatsApp app — see utils/whatsappChatbot.js and routes/adminWhatsapp.js.
const whatsAppMessageSchema = new mongoose.Schema({
  phone: { type: String, required: true }, // canonical +9665XXXXXXXX (see utils/phone.js)
  direction: { type: String, enum: ['in', 'out'], required: true },
  body: { type: String, default: '' },
  // 'text' | 'button' (a quick-reply tap) | 'template' (an approved template we sent) | 'system' (an internal note)
  messageType: { type: String, enum: ['text', 'button', 'template', 'system'], default: 'text' },
  // Who produced an outbound message: 'bot' (automated) or an admin User id. Unset for inbound messages.
  sentBy: { type: String, enum: ['bot', 'admin'] },
  adminUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

whatsAppMessageSchema.index({ phone: 1, createdAt: 1 });

module.exports = mongoose.model('WhatsAppMessage', whatsAppMessageSchema);
