const sendEmail = require('../utils/sendEmail');
const sendSMS   = require('../utils/sendSMS');
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { body, validationResult } = require('express-validator');

const JWT_SECRET = process.env.JWT_SECRET || 'ahmed-cooling-secret-key-2024-secure-token';

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// ─────────────────────────────────────────
//  Helper: standard user response object
// ─────────────────────────────────────────
const userResponse = (user) => ({
  id:       user._id.toString(),
  _id:      user._id.toString(),
  fullName: user.fullName || 'User',
  email:    user.email    || null,
  phone:    user.phone    || null,
  address:  user.address  || '',
  role:     user.role     || 'customer',
  isPhoneVerified: user.isPhoneVerified || false,
  authProvider:    user.authProvider   || 'local',
});

// ================================
// PHONE VALIDATION — PK & SA only
// ================================
const validatePhoneNumber = (phone) => {
  if (!phone) return { valid: false, msg: 'Phone number is required' };
  const clean = phone.replace(/[^\d+]/g, '');
  if (clean.startsWith('+92')) {
    return /^\+923\d{9}$/.test(clean) ? { valid: true } : { valid: false, msg: 'Pakistan: +92 3XX XXXXXXX' };
  }
  if (clean.startsWith('+966')) {
    return /^\+9665\d{8}$/.test(clean) ? { valid: true } : { valid: false, msg: 'Saudi: +966 5X XXXXXXXX' };
  }
  return { valid: false, msg: 'Only Pakistan (+92) and Saudi Arabia (+966) numbers allowed' };
};

const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail.com', 'mailinator.com', 'guerrillamail.com', 'yopmail.com', '10minutemail.com',
  'trashmail.com', 'temp-mail.org', 'dispostable.com', 'getnada.com', 'dropmail.me',
  'guerrillamail.biz', 'guerrillamail.de', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamailblock.com', 'spam4.me', 'grr.la', 'teleworm.us', 'dayrep.com', 'fleeing.cc',
  'gixpos.com', 'vintomland.com', 'tempm.com', 'mail.tm', 'mail.gw', 'moakt.com', 'dispostable.com'
];

const isDisposableEmail = (email) => {
  if (!email) return false;
  const domain = email.split('@')[1];
  return DISPOSABLE_EMAIL_DOMAINS.includes(domain?.toLowerCase());
};

// ================================
// EMAIL: REGISTER
// ================================
router.post('/register', [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { fullName, name, email, password, phone, address } = req.body;
    const userName = fullName || name;

    if (!userName || !userName.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required' });
    }

    if (isDisposableEmail(email)) {
      return res.status(400).json({ success: false, message: 'Disposable email addresses are not allowed. Please use a permanent email.' });
    }

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    const phoneCheck = validatePhoneNumber(phone);
    if (!phoneCheck.valid) {
      return res.status(400).json({ success: false, message: phoneCheck.msg });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }

    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({ success: false, message: 'This phone number is already registered' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const user = new User({
      fullName: userName,
      email,
      password,
      phone,
      address:  address || '',
      otp,
      otpExpires:   new Date(Date.now() + 10 * 60 * 1000),
      isVerified:   false,
      authProvider: 'local'
    });

    await user.save();
    console.log('✅ User saved');

    let otpSentVia = 'console';

    // SMS OTP (primary), email fallback
    if (phone) {
      try {
        await sendSMS(phone, otp);
        otpSentVia = 'sms';
        console.log('✅ OTP sent via SMS to:', phone);
      } catch (smsErr) {
        console.log('❌ SMS failed, trying email:', smsErr.message);
        try {
          await sendEmail(email, otp);
          otpSentVia = 'email';
          console.log('✅ OTP fallback email sent to:', email);
        } catch (emailErr) {
          console.log('❌ Email also failed:', emailErr.message);
        }
      }
    } else {
      try {
        await sendEmail(email, otp);
        otpSentVia = 'email';
      } catch (emailErr) {
        console.log('❌ Email send failed:', emailErr.message);
      }
    }

    const maskedPhone = phone ? phone.slice(0, 4) + '****' + phone.slice(-3) : null;

    res.status(201).json({
      success: true,
      message: otpSentVia === 'sms'
        ? `OTP sent to your phone (${maskedPhone})`
        : 'OTP sent to your email.',
      email,
      phone: maskedPhone,
      otpSentVia,
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// ================================
// VERIFY OTP — email or phone
// ================================
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, phone, otp } = req.body;
    const identifier = email || phone;
    console.log('🔍 Verifying OTP for:', identifier);

    const user = email
      ? await User.findOne({ email })
      : await User.findOne({ phone });

    if (!user) return res.status(400).json({ success: false, message: 'User not found' });

    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    if (user.otpExpires < new Date()) {
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
    }

    user.isVerified = true;
    if (phone || user.authProvider === 'phone') {
      user.isPhoneVerified = true;
    }
    user.otp        = undefined;
    user.otpExpires = undefined;
    await user.save();
    console.log('✅ User verified:', identifier);

    if (phone && !email) {
      const token = generateToken(user);
      return res.status(200).json({
        success: true,
        message: 'Phone verified! Welcome to Ahmed Cooling.',
        token,
        userId: user._id.toString(),
        user: userResponse(user),
      });
    }

    res.status(200).json({ success: true, message: 'Verified successfully! Please login.' });

  } catch (error) {
    console.error('❌ Verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================================
// EMAIL: RESEND OTP
// ================================
router.post('/resend-otp', async (req, res) => {
  try {
    const { email, phone } = req.body;

    const user = email
      ? await User.findOne({ email })
      : await User.findOne({ phone });

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.isVerified && user.isPhoneVerified) return res.status(400).json({ success: false, message: 'User already verified' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp        = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    let otpSentVia = 'console';
    const userPhone = user.phone || phone;

    if (userPhone) {
      try {
        await sendSMS(userPhone, otp);
        otpSentVia = 'sms';
        console.log('✅ OTP resent via SMS to:', userPhone);
      } catch (smsErr) {
        console.log('❌ SMS resend failed:', smsErr.message);
        if (user.email) {
          try { await sendEmail(user.email, otp); otpSentVia = 'email'; } catch {}
        }
      }
    } else if (user.email) {
      try { await sendEmail(user.email, otp); otpSentVia = 'email'; } catch {}
    }

    res.status(200).json({
      success: true,
      message: otpSentVia === 'sms' ? 'OTP resent to your phone' : 'OTP resent to your email',
      otpSentVia,
    });

  } catch (error) {
    console.error('❌ Resend OTP error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================================
// EMAIL: LOGIN
// ================================
router.post('/login', [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password' });

    if (!user.isVerified) {
      return res.status(403).json({ success: false, message: 'Please verify your email first', email });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid email or password' });

    const token = generateToken(user);
    console.log('✅ Login successful:', email, 'ID:', user._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      userId: user._id.toString(),
      user: userResponse(user),
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================================
// PHONE: REGISTER — OTP via email (FREE)
// ================================
router.post('/phone/register', async (req, res) => {
  try {
    const { fullName, name, phone, password, email } = req.body;
    const userName = fullName || name;

    if (!userName || !phone || !password) {
      return res.status(400).json({ success: false, message: 'Name, phone and password are required' });
    }
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required for OTP verification' });
    }

    if (isDisposableEmail(email)) {
      return res.status(400).json({ success: false, message: 'Disposable email addresses are not allowed. Please use a permanent email.' });
    }

    const phoneCheck = validatePhoneNumber(phone);
    if (!phoneCheck.valid) {
      return res.status(400).json({ success: false, message: phoneCheck.msg });
    }

    let user = await User.findOne({ phone });
    if (user && user.isPhoneVerified) {
      return res.status(409).json({ success: false, message: 'Phone already registered. Please sign in.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    if (user) {
      user.fullName = userName;
      user.password = password;
      user.email = email;
      user.otp = otp;
      user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();
    } else {
      user = new User({
        fullName: userName, phone, email, password,
        authProvider: 'phone', isPhoneVerified: false, isVerified: false,
        otp, otpExpires: new Date(Date.now() + 10 * 60 * 1000),
      });
      await user.save();
    }

    console.log('✅ Phone user saved');

    try {
      await sendEmail(email, otp);
      console.log('✅ OTP email sent to:', email);
    } catch (emailErr) {
      console.log('❌ Email failed:', emailErr.message);
    }

    res.status(201).json({ success: true, message: 'OTP sent to your email.' });

  } catch (error) {
    console.error('❌ Phone register error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// ================================
// PHONE: LOGIN  ← NEW
// ================================
router.post('/phone/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ success: false, message: 'Phone and password are required' });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid phone number or password' });
    }

    if (!user.isPhoneVerified) {
      return res.status(403).json({ success: false, message: 'Phone not verified. Please complete registration.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid phone number or password' });
    }

    const token = generateToken(user);
    console.log('✅ Phone login successful:', phone, 'ID:', user._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      userId: user._id.toString(),
      user: userResponse(user),
    });

  } catch (error) {
    console.error('❌ Phone login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================================
// SOCIAL LOGIN
// ================================
// ================================
// SOCIAL LOGIN — FIXED
// ================================
router.post('/social', async (req, res) => {
  try {
    const { email, fullName, provider, googleId, picture } = req.body;

    if (!email || !provider) {
      return res.status(400).json({ success: false, message: 'Email and provider are required' });
    }

    let user = await User.findOne({ email });

    if (!user) {
      // ── Naya user banao ──
      user = new User({
        email,
        fullName:     fullName || email.split('@')[0],
        password:     null,
        phone:        null,
        address:      '',
        isVerified:   true,
        authProvider: provider,
        googleId:     googleId || undefined,
        googleProfile: { displayName: fullName, picture },
        profileImage:  picture || '',
      });
      await user.save();
      console.log('✅ New social user created:', email, 'Provider:', provider);

    } else {
      // ── Existing user update karo ──
      user.fullName     = fullName || user.fullName;
      user.authProvider = provider;
      user.isVerified   = true;
      user.profileImage = picture || user.profileImage;
      user.googleProfile = { displayName: fullName, picture };

      if (provider === 'google' && googleId) {
        user.googleId = googleId;
      }

      await user.save();
      console.log('✅ Existing user updated with social login:', email);
    }

    const token = generateToken(user);

    res.json({
      success: true,
      message: `Logged in with ${provider}`,
      token,
      user: userResponse(user),
    });

  } catch (error) {
    console.error('❌ Social login error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// ================================
// FORGOT PASSWORD
// ================================
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp        = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();
    console.log('✅ Reset OTP generated');

    try {
      await sendEmail(email, otp);
      console.log('✅ Reset OTP email sent to:', email);
    } catch (emailError) {
      console.log('❌ Reset email send failed:', emailError.message);
    }

    res.json({ success: true, message: 'Reset code sent to your email' });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================================
// VERIFY RESET OTP
// ================================
router.post('/verify-reset-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    if (user.otpExpires < new Date()) {
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
    }

    res.json({ success: true, message: 'OTP verified successfully' });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================================
// RESET PASSWORD
// ================================
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token }    = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      otp:        token,
      otpExpires: { $gt: new Date() }
    });

    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired reset code' });

    user.password   = password;
    user.otp        = undefined;
    user.otpExpires = undefined;
    await user.save();
    console.log('✅ Password reset for:', user.email || user.phone);

    res.json({ success: true, message: 'Password reset successful' });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================================
// VERIFY TOKEN
// ================================
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user    = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    res.json({ success: true, user });

  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

module.exports = router;