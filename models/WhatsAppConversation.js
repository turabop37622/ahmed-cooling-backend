const mongoose = require('mongoose');

// One row per customer phone number: the conversation's current state. 'bot' means the automated FAQ bot (or the
// booking-confirmation flow) answers; 'needs_human' means the bot detected a request to talk to a person and is
// staying quiet until an admin replies from the admin panel; 'human' means an admin is actively handling it.
const whatsAppConversationSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  customerName: { type: String, default: '' },
  status: { type: String, enum: ['bot', 'needs_human', 'human'], default: 'bot' },
  lastMessagePreview: { type: String, default: '' },
  lastMessageAt: { type: Date, default: Date.now },
  lastDirection: { type: String, enum: ['in', 'out'] },
}, { timestamps: true });

module.exports = mongoose.model('WhatsAppConversation', whatsAppConversationSchema);
