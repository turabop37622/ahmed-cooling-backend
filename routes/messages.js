// ============================================================
//  messages.js  —  Ahmed Cooling Backend
//  Complete Messages Backend
//
//  File structure:
//    models/Conversation.js   → Conversation schema
//    models/Message.js        → Message schema
//    routes/messages.js       → All routes
//
//  Routes:
//    POST   /api/messages/send                         → Send message (creates convo if needed)
//    GET    /api/messages/conversations/:userId        → Get all conversations for a user
//    GET    /api/messages/conversation/:conversationId → Get messages in a conversation
//    PUT    /api/messages/read/:conversationId/:userId → Mark messages as read
//    DELETE /api/messages/conversation/:conversationId → Delete conversation
// ============================================================

// ─────────────────────────────────────────────────────────────
//  1.  models/Conversation.js
// ─────────────────────────────────────────────────────────────
/*
const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  }],

  adId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ad',
    required: true,
  },

  adTitle:    { type: String },
  adPrice:    { type: Number },
  adCategory: { type: String },

  lastMessage:     { type: String, default: '' },
  lastMessageTime: { type: Date,   default: Date.now },
  lastSenderId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // unread count per user
  unreadCounts: {
    type: Map,
    of: Number,
    default: {},
  },

  isDeleted: { type: Boolean, default: false },

}, { timestamps: true });

// Index for fast user lookup
ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ adId: 1 });

module.exports = mongoose.model('Conversation', ConversationSchema);
*/

// ─────────────────────────────────────────────────────────────
//  2.  models/Message.js
// ─────────────────────────────────────────────────────────────
/*
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
  },

  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  senderName: { type: String },

  text: {
    type: String,
    required: true,
    maxlength: 1000,
    trim: true,
  },

  isRead:   { type: Boolean, default: false },
  isEdited: { type: Boolean, default: false },

}, { timestamps: true });

MessageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', MessageSchema);
*/

// ─────────────────────────────────────────────────────────────
//  3.  routes/messages.js  (MAIN FILE — paste this in routes/)
// ─────────────────────────────────────────────────────────────

const express      = require('express');
const mongoose     = require('mongoose');
const router       = express.Router();

// ── Inline schemas (remove these if you use separate model files above) ──

const ConversationSchema = new mongoose.Schema({
  participants:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  adId:            { type: mongoose.Schema.Types.ObjectId, ref: 'Ad' },
  adTitle:         { type: String },
  adPrice:         { type: Number },
  adCategory:      { type: String },
  lastMessage:     { type: String,  default: '' },
  lastMessageTime: { type: Date,    default: Date.now },
  lastSenderId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  unreadCounts:    { type: Map, of: Number, default: {} },
  isDeleted:       { type: Boolean, default: false },
}, { timestamps: true });

ConversationSchema.index({ participants: 1 });

const Conversation = mongoose.models.Conversation
  || mongoose.model('Conversation', ConversationSchema);

// ───────────────────────

const MessageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  senderId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderName:     { type: String },
  text:           { type: String, required: true, maxlength: 1000, trim: true },
  isRead:         { type: Boolean, default: false },
  isEdited:       { type: Boolean, default: false },
}, { timestamps: true });

MessageSchema.index({ conversationId: 1, createdAt: 1 });

const Message = mongoose.models.Message
  || mongoose.model('Message', MessageSchema);

// ═════════════════════════════════════════════════════════════
//  HELPER: convert string ID → ObjectId safely
// ═════════════════════════════════════════════════════════════
const toId = id => {
  try   { return new mongoose.Types.ObjectId(id); }
  catch { return null; }
};

// ═════════════════════════════════════════════════════════════
//  POST /api/messages/send
//  Body: { senderId, receiverId, adId, adTitle?, adPrice?,
//          adCategory?, text, conversationId? }
//
//  → Creates conversation if none exists between the two users
//    for the same ad, then saves the message.
// ═════════════════════════════════════════════════════════════
router.post('/send', async (req, res) => {
  try {
    const {
      senderId, receiverId, adId,
      adTitle, adPrice, adCategory,
      text, conversationId,
    } = req.body;

    // ── Validate ──
    if (!senderId || !receiverId || !text?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'senderId, receiverId aur text zaroori hain',
      });
    }

    const sId = toId(senderId);
    const rId = toId(receiverId);
    if (!sId || !rId) {
      return res.status(400).json({ success: false, message: 'Invalid user IDs' });
    }

    // ── Find or create conversation ──
    let convo;

    if (conversationId) {
      convo = await Conversation.findById(conversationId);
    }

    if (!convo) {
      // Look for existing convo between these two users for this ad
      const query = {
        participants: { $all: [sId, rId] },
        isDeleted: false,
      };
      if (adId) query.adId = toId(adId);

      convo = await Conversation.findOne(query);
    }

    if (!convo) {
      // Create new conversation
      convo = await Conversation.create({
        participants: [sId, rId],
        adId:         adId ? toId(adId) : undefined,
        adTitle:      adTitle  || '',
        adPrice:      adPrice  || 0,
        adCategory:   adCategory || '',
        unreadCounts: { [receiverId]: 1 },
      });
    }

    // ── Save message ──
    const message = await Message.create({
      conversationId: convo._id,
      senderId:       sId,
      senderName:     req.body.senderName || '',
      text:           text.trim(),
    });

    // ── Update conversation summary ──
    const currentUnread = convo.unreadCounts?.get?.(receiverId) || 0;
    convo.lastMessage     = text.trim().substring(0, 100);
    convo.lastMessageTime = new Date();
    convo.lastSenderId    = sId;
    convo.unreadCounts    = {
      ...(Object.fromEntries(convo.unreadCounts || new Map())),
      [receiverId]: currentUnread + 1,
    };
    await convo.save();

    res.status(201).json({
      success: true,
      message: 'Message bhej diya gaya',
      data: {
        message,
        conversationId: convo._id,
      },
    });

  } catch (err) {
    console.error('❌ Send message error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════
//  GET /api/messages/conversations/:userId
//  → All conversations for a user, newest first
//    Each includes: participant info, ad info, last message,
//    unread count
// ═════════════════════════════════════════════════════════════
router.get('/conversations/:userId', async (req, res) => {
  try {
    const userId = toId(req.params.userId);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    const conversations = await Conversation
      .find({ participants: userId, isDeleted: false })
      .sort({ lastMessageTime: -1 })
      .populate('participants', 'name email phone avatar')
      .populate('adId', 'brand model price categoryId images')
      .lean();

    // Shape for frontend
    const shaped = conversations.map(conv => {
      const participant = conv.participants.find(
        p => p._id.toString() !== req.params.userId
      );

      const unreadCount = conv.unreadCounts?.[req.params.userId] || 0;

      return {
        _id:             conv._id,
        participant:     participant || { name: 'Unknown', _id: null },
        adId:            conv.adId?._id || conv.adId,
        adTitle:         conv.adTitle  || conv.adId?.brand + ' ' + conv.adId?.model || 'Ad',
        adPrice:         conv.adPrice  || conv.adId?.price || 0,
        adCategory:      conv.adCategory || conv.adId?.categoryId || '',
        lastMessage:     conv.lastMessage,
        lastMessageTime: conv.lastMessageTime,
        unreadCount,
        updatedAt:       conv.updatedAt,
      };
    });

    res.json({ success: true, data: shaped });

  } catch (err) {
    console.error('❌ Conversations error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════
//  GET /api/messages/conversation/:conversationId
//  Query: ?page=1&limit=50
//  → All messages in a conversation, oldest first
// ═════════════════════════════════════════════════════════════
router.get('/conversation/:conversationId', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const messages = await Message
      .find({ conversationId: req.params.conversationId })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await Message.countDocuments({ conversationId: req.params.conversationId });

    res.json({
      success: true,
      data: messages,
      pagination: {
        total,
        page:  Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
    });

  } catch (err) {
    console.error('❌ Messages error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════
//  PUT /api/messages/read/:conversationId/:userId
//  → Mark all messages in conversation as read for this user
//    + reset unread count to 0
// ═════════════════════════════════════════════════════════════
router.put('/read/:conversationId/:userId', async (req, res) => {
  try {
    const { conversationId, userId } = req.params;

    // Mark messages read
    await Message.updateMany(
      { conversationId, senderId: { $ne: toId(userId) }, isRead: false },
      { $set: { isRead: true } }
    );

    // Reset unread count
    const conv = await Conversation.findById(conversationId);
    if (conv) {
      const counts = Object.fromEntries(conv.unreadCounts || new Map());
      counts[userId] = 0;
      conv.unreadCounts = counts;
      await conv.save();
    }

    res.json({ success: true, message: 'Messages read mark ho gaye' });

  } catch (err) {
    console.error('❌ Mark read error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════
//  DELETE /api/messages/conversation/:conversationId
//  Body: { userId }
//  → Soft delete (marks isDeleted = true)
// ═════════════════════════════════════════════════════════════
router.delete('/conversation/:conversationId', async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.conversationId);
    if (!conv) {
      return res.status(404).json({ success: false, message: 'Conversation nahi mili' });
    }

    // Only participants can delete
    const userId = toId(req.body.userId);
    const isMember = conv.participants.some(p => p.equals(userId));
    if (!isMember) {
      return res.status(403).json({ success: false, message: 'Aap is conversation ke member nahi hain' });
    }

    conv.isDeleted = true;
    await conv.save();

    res.json({ success: true, message: 'Conversation delete ho gayi' });

  } catch (err) {
    console.error('❌ Delete conversation error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

module.exports = router;

// ─────────────────────────────────────────────────────────────
//  4.  app.js / server.js mein add karein:
//
//  const messagesRouter = require('./routes/messages');
//  app.use('/api/messages', messagesRouter);
// ─────────────────────────────────────────────────────────────