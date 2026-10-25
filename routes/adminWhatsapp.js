// Admin-facing WhatsApp inbox: lets an admin see conversations the bot has handed off (or any conversation) and
// reply as the business, from the browser — the only way to "manually use" the number now that it is not also
// sitting in a phone's WhatsApp app (see utils/whatsappChatbot.js for why).
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const WhatsAppConversation = require('../models/WhatsAppConversation');
const User = require('../models/User');
const Booking = require('../models/Booking');
const whatsappCloud = require('../utils/whatsappCloud');
const { logMessage, setStatus } = require('../utils/whatsappConversationStore');
const { phoneVariants } = require('../utils/phone');
const whatsappHealth = require('../utils/whatsappHealth');

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
  next();
};

// Whether Meta currently accepts our WhatsApp token (see utils/whatsappHealth.js). `ok: false` = the bot is cut off.
router.get('/health', auth, adminOnly, (req, res) => {
  res.json({ success: true, health: whatsappHealth.getState() });
});

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

// Meta only lets us send free text within 24h of the customer's last message to us.
const WINDOW_MS = 24 * 60 * 60 * 1000;
const windowFor = async (phone) => {
  const last = await WhatsAppMessage.findOne({ phone, direction: 'in' }).sort({ createdAt: -1 }).select('createdAt');
  const closesAt = last ? new Date(new Date(last.createdAt).getTime() + WINDOW_MS) : null;
  return { windowOpen: !!closesAt && closesAt.getTime() > Date.now(), windowClosesAt: closesAt };
};

// Message history for one phone number (oldest first, like a chat thread).
router.get('/conversations/:phone/messages', auth, adminOnly, async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone);
    const messages = await WhatsAppMessage.find({ phone }).sort({ createdAt: 1 }).limit(500);
    res.json({ success: true, messages, ...(await windowFor(phone)) });
  } catch (err) {
    console.error('❌ Admin WhatsApp messages error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Who this phone number belongs to, if anyone, plus their recent bookings — shown at the top of the admin
// inbox's conversation view so an admin doesn't have to leave the page to look someone up.
router.get('/conversations/:phone/customer', auth, adminOnly, async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone);
    const variants = phoneVariants(phone);
    const user = await User.findOne({ phone: { $in: variants }, role: 'customer' })
      .select('fullName email phone createdAt authProvider');
    const bookings = await Booking.find({ phone: { $in: variants }, deletedAt: null })
      .select('orderNumber bookingId status service serviceDetails date time address city totalAmount createdAt')
      .sort({ createdAt: -1 })
      .limit(10);
    res.json({ success: true, user, bookings });
  } catch (err) {
    console.error('❌ Admin WhatsApp customer lookup error:', err);
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

    const win = await windowFor(phone);
    if (!win.windowOpen) {
      return res.status(409).json({ success: false, windowOpen: false, message: 'The 24-hour reply window has closed: the customer has not written in the last 24 hours, so WhatsApp only allows an approved template message. Ask them to message us again, or call them.' });
    }
    await whatsappCloud.sendTextMessage(phone, message);
    await logMessage(phone, 'out', message, { messageType: 'text', sentBy: 'admin', adminUser: req.user.id });
    const conversation = await setStatus(phone, 'human');
    res.json({ success: true, conversation });
  } catch (err) {
    console.error('❌ Admin WhatsApp reply error:', err.response?.data || err.message);
    if (err.response?.data?.error?.code === 131047) {
      return res.status(409).json({ success: false, windowOpen: false, message: 'The 24-hour reply window has closed: WhatsApp only allows an approved template message now. Ask the customer to message us again, or call them.' });
    }
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
