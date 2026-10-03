const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Booking = require('../models/Booking');
const { validatePhone, normalizePhone, phoneVariants } = require('../utils/phone');
const { cleanStr, isValidPassword, PASSWORD_MIN, PASSWORD_MAX } = require('../utils/security');

const serverError = (res) => res.status(500).json({ success: false, message: 'Server error' });
const LANGUAGES = ['en', 'ar'];
const OPEN_STATUSES = ['pending', 'confirmed', 'assigned', 'on_the_way', 'in_progress'];

// Get user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (error) {
    console.error('Get profile error:', error);
    serverError(res);
  }
});

// Update user profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { fullName, name, phone, address, language } = req.body;
    for (const [field, value] of Object.entries({ fullName, name, phone, address, language })) {
      if (value !== undefined && value !== null && typeof value !== 'string') {
        return res.status(400).json({ success: false, message: `${field} must be text` });
      }
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const newName = cleanStr(fullName || name, 100);
    if ((fullName !== undefined || name !== undefined) && !newName) {
      return res.status(400).json({ success: false, message: 'Name cannot be empty' });
    }
    if (newName) user.fullName = newName;

    if (address !== undefined && address !== null) {
      if (address.length > 500) return res.status(400).json({ success: false, message: 'Address is too long' });
      user.address = address.trim();
    }

    if (language) {
      if (!LANGUAGES.includes(language)) return res.status(400).json({ success: false, message: 'Unsupported language' });
      user.language = language;
    }

    if (phone) {
      const normalized = normalizePhone(phone);
      // Re-saving the number already on the account is always fine (older accounts may hold a non-Saudi number);
      // any NEW number must be a valid Saudi mobile number.
      if (!phoneVariants(user.phone || '').includes(normalized)) {
        const check = validatePhone(phone);
        if (!check.valid) return res.status(400).json({ success: false, message: check.msg });
        const taken = await User.findOne({ phone: { $in: phoneVariants(phone) }, _id: { $ne: user._id } });
        if (taken) return res.status(409).json({ success: false, message: 'This phone number is already registered' });
        user.phone = normalized;
      }
    }

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        _id: user._id,
        fullName: user.fullName,
        name: user.fullName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role,
        language: user.language,
        settings: user.settings,
      },
    });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: 'This phone number is already registered' });
    console.error('Update profile error:', error);
    serverError(res);
  }
});

// Change password
router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || !currentPassword) {
      return res.status(400).json({ success: false, message: 'Current password is required' });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ success: false, message: `New password must be ${PASSWORD_MIN} to ${PASSWORD_MAX} characters` });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = newPassword; // also invalidates every older login token
    await user.save();

    res.json({ success: true, message: 'Password changed successfully. Please sign in again.' });
  } catch (error) {
    console.error('Change password error:', error);
    serverError(res);
  }
});

// Update settings (only the known on/off switches are accepted)
router.put('/settings', auth, async (req, res) => {
  try {
    const { settings, language } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (settings && typeof settings === 'object') {
      for (const key of ['pushNotifications', 'emailNotifications', 'smsNotifications']) {
        if (typeof settings[key] === 'boolean') user.set(`settings.${key}`, settings[key]);
      }
    }
    if (language !== undefined) {
      if (!LANGUAGES.includes(language)) return res.status(400).json({ success: false, message: 'Unsupported language' });
      user.language = language;
    }

    await user.save();
    res.json({ success: true, message: 'Settings updated successfully', settings: user.settings, language: user.language });
  } catch (error) {
    console.error('Update settings error:', error);
    serverError(res);
  }
});

// Get user bookings
router.get('/bookings', auth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const query = { user: req.user.id, deletedAt: null }; // bookings soft-deleted by the admin are hidden
    if (typeof req.query.status === 'string' && OPEN_STATUSES.concat(['completed', 'cancelled']).includes(req.query.status)) query.status = req.query.status;

    const bookings = await Booking.find(query)
      .populate('technician', 'fullName phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    const total = await Booking.countDocuments(query);

    res.json({ success: true, bookings, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Get bookings error:', error);
    serverError(res);
  }
});

// Invoices are not part of the product yet; answer with an empty list instead of crashing.
router.get('/invoices', auth, async (req, res) => {
  res.json({ success: true, invoices: [], pagination: { total: 0, page: 1, limit: 10, pages: 0 } });
});

// Delete account. Bookings are kept for the business's records but stripped of personal details.
router.delete('/account', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role !== 'customer') {
      return res.status(403).json({ success: false, message: 'Staff accounts cannot be deleted here' });
    }

    if (user.password) {
      if (typeof req.body.password !== 'string' || !(await user.comparePassword(req.body.password))) {
        return res.status(401).json({ success: false, message: 'Password is incorrect' });
      }
    } else if (req.body.confirm !== 'DELETE') {
      // Google sign-in accounts have no password: they confirm by typing DELETE.
      return res.status(400).json({ success: false, message: 'Type DELETE to confirm account deletion' });
    }

    // A booking that is still open needs its address and phone; the customer cancels it first.
    if (await Booking.countDocuments({ user: user._id, status: { $in: OPEN_STATUSES } }) > 0) {
      return res.status(409).json({ success: false, message: 'Please cancel your open bookings before deleting your account' });
    }

    await Booking.updateMany(
      { user: user._id },
      { $set: { user: null, customerName: 'Deleted user', email: '', phone: 'deleted', address: 'deleted', comments: '', problemDescription: '' } }
    );
    await User.deleteOne({ _id: user._id });

    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    serverError(res);
  }
});

module.exports = router;
