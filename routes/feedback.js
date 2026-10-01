const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Inquiry = require('../models/Inquiry');
const GeneralRating = require('../models/GeneralRating');
const User = require('../models/User');

const router = express.Router();
const submitLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5 });

router.post('/contact', submitLimiter, [
  body('name').isString().trim().isLength({ min: 2, max: 100 }),
  body('phone').isString().trim().matches(/^\+?[0-9\s-]{8,25}$/),
  body('message').isString().trim().isLength({ min: 5, max: 2000 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Please check your contact details and message' });
  try {
    await Inquiry.create({ name: req.body.name, phone: req.body.phone, message: req.body.message });
    res.status(201).json({ success: true, message: 'Message received' });
  } catch {
    res.status(500).json({ success: false, message: 'Could not save message' });
  }
});

router.post('/rate', auth, submitLimiter, [
  body('rating').isInt({ min: 1, max: 5 }),
  body('feedback').optional().isString().isLength({ max: 500 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Rating must be 1 to 5 and feedback under 500 characters' });
  try {
    const user = await User.findById(req.user.id).select('fullName');
    await GeneralRating.create({ user: req.user.id, rating: Number(req.body.rating), feedback: req.body.feedback || '', name: user.fullName });
    res.status(201).json({ success: true, message: 'Rating received' });
  } catch {
    res.status(500).json({ success: false, message: 'Could not save rating' });
  }
});

module.exports = router;
