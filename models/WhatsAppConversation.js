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
  // The language the customer picked from the welcome buttons (utils/whatsappMenu.js) — every bot reply that has
  // an English and an Arabic version uses this one. Unset until they choose (or until we detect it from what they type).
  language: { type: String, enum: ['en', 'ar'] },
  languagePromptedAt: { type: Date },
  // A real first question typed before they picked a language — answered right after they choose, so it isn't lost.
  pendingText: { type: String },
  // In-progress "book a service over WhatsApp" conversation (utils/whatsappBookingFlow.js). Unset once the
  // booking is created or the customer cancels/abandons it.
  bookingDraft: {
    step: { type: String, enum: ['service', 'date', 'time', 'address', 'confirm'] },
    serviceId: String,
    serviceName: String,
    serviceNameAr: String,
    date: String,
    time: String,
    address: String,
    latitude: Number,
    longitude: Number,
    // Drafts left untouched for a few hours are dropped so an old half-finished booking never hijacks a new chat.
    updatedAt: Date,
  },
}, { timestamps: true });

module.exports = mongoose.model('WhatsAppConversation', whatsAppConversationSchema);
