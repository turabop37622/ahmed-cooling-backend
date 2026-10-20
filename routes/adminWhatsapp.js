// Admin-facing WhatsApp inbox: lets an admin see conversations the bot has handed off (or any conversation) and
// reply as the business, from the browser — the only way to "manually use" the number now that it is not also
// sitting in a phone's WhatsApp app (see utils/whatsappChatbot.js for why).
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const WhatsAppConversation = require('../models/WhatsAppConversation');
const whatsappCloud = require('../utils/whatsappCloud');
const { logMessage, setStatus } = require('../utils/whatsappConversationStore');

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
  next();
};

// List conversations, most recently active first. ?status=needs_human filters to just the ones waiting on a
// human; omit it to see everything.
router.get('/conversations', auth, adminOnly, async (req, res) => {
  try {
    const filter = {};
    if (['bot', 'needs_human', 'human'].includes(req.query.status)) filter.status = req.query.status;
    const conversations = await WhatsAppConversation.find(filter).sort({ lastMessageAt: -1 }).limit(200);
    res.json({ success: true, conversations });
  } catch (err) {
    console.error('❌ Admin WhatsApp conversations error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Message history for one phone number (oldest first, like a chat thread).
router.get('/conversations/:phone/messages', auth, adminOnly, async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone);
    const messages = await WhatsAppMessage.find({ phone }).sort({ createdAt: 1 }).limit(500);
    res.json({ success: true, messages });
  } catch (err) {
    console.error('❌ Admin WhatsApp messages error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin sends a freeform reply. Only valid within Meta's 24h customer-service window (i.e. the customer
// messaged first/recently) — Meta's API itself enforces that and returns an error otherwise, which we surface.
router.post('/conversations/:phone/reply', auth, adminOnly, async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone);
    const message = String(req.body.message || '').trim().slice(0, 4096);
    if (!message) return res.status(400).json({ success: false, message: 'Message is required' });

    await whatsappCloud.sendTextMessage(phone, message);
    await logMessage(phone, 'out', message, { messageType: 'text', sentBy: 'admin', adminUser: req.user.id });
    const conversation = await setStatus(phone, 'human');
    res.json({ success: true, conversation });
  } catch (err) {
    console.error('❌ Admin WhatsApp reply error:', err.response?.data || err.message);
    res.status(500).json({ success: false, message: err.response?.data?.error?.message || 'Failed to send message' });
  }
});

// Hands the conversation back to the automated bot (the next message from this customer gets an automatic reply
// again instead of staying silent).
router.post('/conversations/:phone/release', auth, adminOnly, async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone);
    const conversation = await setStatus(phone, 'bot');
    res.json({ success: true, conversation });
  } catch (err) {
    console.error('❌ Admin WhatsApp release error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
