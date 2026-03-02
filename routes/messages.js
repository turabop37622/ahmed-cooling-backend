// ════════════════════════════════════════════════════════════════
//  routes/messages.js — FIXED VERSION
//  ✅ Proper message delivery to both sides
//  ✅ Correct read receipts
//  ✅ No duplicate ticking issues
// ════════════════════════════════════════════════════════════════

const express   = require('express');
const mongoose  = require('mongoose');
const router    = express.Router();

// ════════════════════════════════════════════════════════════════
//  SCHEMAS
// ════════════════════════════════════════════════════════════════

const ConversationSchema = new mongoose.Schema({
  // Always exactly 2 participants [id1, id2]
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref:  'User',
    required: true,
  }],
  adId:            { type: mongoose.Schema.Types.ObjectId, ref: 'Ad', required: true },
  adTitle:         { type: String, default: '' },
  adPrice:         { type: Number, default: 0 },
  adCategory:      { type: String, default: '' },
  lastMessage:     { type: String, default: '' },
  lastMessageTime: { type: Date,   default: Date.now },
  lastSenderId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  unreadCounts:    { type: Map, of: Number, default: {} },
  deletedFor:      { type: Map, of: Boolean, default: {} },
}, { timestamps: true });

// ✅ Important indexes
ConversationSchema.index({ participants: 1, adId: 1 });
ConversationSchema.index({ participants: 1, updatedAt: -1 });
ConversationSchema.index({ 'participants._id': 1 });

const Conversation = mongoose.models.Conversation
  || mongoose.model('Conversation', ConversationSchema);

// ─────────────────────────────────────────────────────────────

const MessageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true,
  },
  senderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: { type: String, default: '' },
  text:       { type: String, required: true, maxlength: 1000, trim: true },
  status: {
    type:    String,
    enum:    ['sent', 'delivered', 'read'],
    default: 'sent',
  },
  readAt: { type: Date, default: null },
}, { timestamps: true });

MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ conversationId: 1, senderId: 1, status: 1 });

const Message = mongoose.models.Message
  || mongoose.model('Message', MessageSchema);

// ════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════
const toId = (id) => {
  try   { return new mongoose.Types.ObjectId(String(id)); }
  catch { return null; }
};

const safeMap = (map) => {
  if (!map) return {};
  if (map instanceof Map) return Object.fromEntries(map);
  return { ...map };
};

// ════════════════════════════════════════════════════════════════
//  POST /api/messages/send
// ════════════════════════════════════════════════════════════════
router.post('/send', async (req, res) => {
  try {
    const {
      senderId, senderName = '',
      receiverId,
      adId, adTitle = '', adPrice = 0, adCategory = '',
      text,
      conversationId,
    } = req.body;

    if (!senderId || !receiverId || !text?.trim() || !adId) {
      return res.status(400).json({
        success: false,
        message: 'senderId, receiverId, adId aur text zaroori hain',
      });
    }

    const sId = toId(senderId);
    const rId = toId(receiverId);
    const aId = toId(adId);

    if (!sId || !rId || !aId) {
      return res.status(400).json({ success: false, message: 'Invalid IDs' });
    }

    // ── Find or create conversation ──
    let convo = null;

    if (conversationId) {
      convo = await Conversation.findById(conversationId);
    }

    if (!convo) {
      convo = await Conversation.findOne({
        adId: aId,
        participants: { $all: [sId, rId], $size: 2 },
      });
    }

    if (!convo) {
      convo = await Conversation.create({
        participants: [sId, rId],
        adId:         aId,
        adTitle:      adTitle.trim(),
        adPrice:      Number(adPrice) || 0,
        adCategory:   adCategory,
        unreadCounts: { [String(receiverId)]: 1, [String(senderId)]: 0 },
        deletedFor:   {},
      });
    }

    // ── Save message ──
    const message = await Message.create({
      conversationId: convo._id,
      senderId:       sId,
      senderName:     senderName.trim(),
      text:           text.trim(),
      status:         'sent',
    });

    // ── Update conversation summary ──
    const counts = safeMap(convo.unreadCounts);
    counts[String(receiverId)] = (Number(counts[String(receiverId)]) || 0) + 1;
    counts[String(senderId)]   = 0;

    await Conversation.findByIdAndUpdate(convo._id, {
      $set: {
        lastMessage:                       text.trim().substring(0, 100),
        lastMessageTime:                   new Date(),
        lastSenderId:                      sId,
        unreadCounts:                      counts,
        [`deletedFor.${senderId}`]:        false,
        [`deletedFor.${receiverId}`]:      false,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Message bhej diya gaya',
      data:    { message, conversationId: convo._id },
    });

  } catch (err) {
    console.error('Send error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
//  GET /api/messages/conversations/:userId
//  ✅ Both buyer and seller conversations
// ════════════════════════════════════════════════════════════════
router.get('/conversations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const uId = toId(userId);
    if (!uId) return res.status(400).json({ success: false, message: 'Invalid userId' });

    // ✅ userId is in participants array
    const conversations = await Conversation
      .find({
        participants: uId,
        [`deletedFor.${userId}`]: { $ne: true },
      })
      .sort({ lastMessageTime: -1 })
      .populate('participants', 'fullName email phone profileImage createdAt')
      .populate('adId', 'brand model price categoryId images')
      .lean();

    const shaped = conversations.map(conv => {
      const otherUser = (conv.participants || []).find(
        p => String(p._id) !== String(userId)
      );
      const counts    = safeMap(conv.unreadCounts);
      const unread    = Number(counts[String(userId)] || 0);

      return {
        _id:             conv._id,
        participant: {
          _id:          otherUser?._id   || null,
          name:         otherUser?.fullName || 'Unknown',
          profileImage: otherUser?.profileImage || null,
          online:       false,
        },
        adId:            conv.adId?._id  || conv.adId,
        adTitle:         conv.adTitle    || `${conv.adId?.brand || ''} ${conv.adId?.model || ''}`.trim(),
        adPrice:         conv.adPrice    || conv.adId?.price || 0,
        adCategory:      conv.adCategory || conv.adId?.categoryId || '',
        adImage:         conv.adId?.images?.[0] || null,
        lastMessage:     conv.lastMessage || '',
        lastMessageTime: conv.lastMessageTime,
        lastSenderId:    conv.lastSenderId,
        unreadCount:     unread,
        updatedAt:       conv.updatedAt,
      };
    });

    res.json({ success: true, data: shaped, total: shaped.length });

  } catch (err) {
    console.error('Conversations error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
//  GET /api/messages/conversation/:conversationId?userId=xxx
//  ✅ Auto mark as delivered when fetched by receiver
//  ✅ Sirf "sent" messages ko "delivered" karo
// ════════════════════════════════════════════════════════════════
router.get('/conversation/:conversationId', async (req, res) => {
  try {
    const { conversationId }       = req.params;
    const { page = 1, limit = 50, userId } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const uId = toId(userId);

    // Get messages sorted by created date
    const messages = await Message
      .find({ conversationId })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await Message.countDocuments({ conversationId });

    // ✅ CRITICAL FIX: Auto-deliver sirf "sent" messages
    // (Messages jo mujhe bheje gaye hain aur abhi "sent" hain)
    if (uId) {
      await Message.updateMany(
        {
          conversationId,
          senderId: { $ne: uId },  // ✓ Messages jo mujhe bheje gaye
          status: 'sent',          // ✓ Sirf "sent" status
        },
        { $set: { status: 'delivered' } }
      );
    }

    res.json({
      success: true,
      data:    messages,
      pagination: {
        total,
        page:    Number(page),
        pages:   Math.ceil(total / Number(limit)),
        hasMore: skip + messages.length < total,
      },
    });

  } catch (err) {
    console.error('Messages error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
//  PUT /api/messages/read/:conversationId/:userId
//  ✅ Mark messages as READ (double blue tick)
// ════════════════════════════════════════════════════════════════
router.put('/read/:conversationId/:userId', async (req, res) => {
  try {
    const { conversationId, userId } = req.params;
    const uId = toId(userId);

    // ✅ CORRECT: Sirf wo messages read mark karo jo MUJHE bheje gaye
    const result = await Message.updateMany(
      {
        conversationId,
        senderId: { $ne: uId },  // Messages jo mujhe bheje gaye
        status:   { $in: ['sent', 'delivered'] },  // Jo abhi read nahi hue
      },
      { $set: { status: 'read', readAt: new Date() } }
    );

    // Reset unread count
    await Conversation.findByIdAndUpdate(conversationId, {
      $set: { [`unreadCounts.${userId}`]: 0 },
    });

    res.json({
      success:  true,
      message:  'Read ho gaya',
      modified: result.modifiedCount,
    });

  } catch (err) {
    console.error('Read error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
//  GET /api/messages/status/:conversationId/:userId
//  ✅ Sender polling — mere bheje messages ka status check
// ════════════════════════════════════════════════════════════════
router.get('/status/:conversationId/:userId', async (req, res) => {
  try {
    const { conversationId, userId } = req.params;
    const uId = toId(userId);

    const messages = await Message
      .find({ conversationId, senderId: uId })
      .select('_id status readAt createdAt')
      .lean();

    res.json({ success: true, data: messages });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
//  GET /api/messages/unread/:userId
//  Total unread badge count
// ════════════════════════════════════════════════════════════════
router.get('/unread/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const uId = toId(userId);

    const convos = await Conversation
      .find({ 
        participants: uId, 
        [`deletedFor.${userId}`]: { $ne: true } 
      })
      .select('unreadCounts')
      .lean();

    const total = convos.reduce((sum, c) => {
      const counts = safeMap(c.unreadCounts);
      return sum + Number(counts[userId] || 0);
    }, 0);

    res.json({ success: true, data: { totalUnread: total } });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
//  DELETE /api/messages/conversation/:conversationId
//  Soft delete — sirf us user ke liye hide
// ════════════════════════════════════════════════════════════════
router.delete('/conversation/:conversationId', async (req, res) => {
  try {
    const { conversationId }   = req.params;
    const { userId }           = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

    const conv = await Conversation.findById(conversationId);
    if (!conv) return res.status(404).json({ success: false, message: 'Nahi mili' });

    const uId = toId(userId);
    const ok = conv.participants.some(p => String(p) === String(uId));
    if (!ok) return res.status(403).json({ success: false, message: 'Unauthorized' });

    await Conversation.findByIdAndUpdate(conversationId, {
      $set: { [`deletedFor.${userId}`]: true },
    });

    res.json({ success: true, message: 'Delete ho gayi' });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;