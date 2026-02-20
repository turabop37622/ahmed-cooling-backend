const sendEmail = require('../utils/sendEmail');
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { body, validationResult } = require('express-validator');

const JWT_SECRET = process.env.JWT_SECRET || "mysecretkey";

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// ✅ REGISTER
router.post('/register', [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    // ✅ FIX: fullName ya name dono accept karo
    const { fullName, name, email, password, phone, address } = req.body;
    const userName = fullName || name;

    if (!userName || !userName.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const user = new User({
      fullName: userName,
      email,
      password,
      phone: phone || '',
      address: address || '',
      otp,
      otpExpires: new Date(Date.now() + 10 * 60 * 1000),
      isVerified: false,
      authProvider: "local"
    });

    await user.save();
    console.log("✅ User saved. OTP:", otp);

    // ✅ Email alag try/catch mein
    try {
      await sendEmail(email, otp);
      console.log("✅ OTP email sent to:", email);
    } catch (emailError) {
      console.log("❌ Email send failed:", emailError.message);
    }

    // ✅ TOKEN NAHI — sirf success
    res.status(201).json({
      success: true,
      message: 'Registration successful. OTP sent to your email.',
      email
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// ✅ VERIFY OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    console.log("🔍 Verifying OTP for:", email, "OTP:", otp);

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ success: false, message: "User not found" });

    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    if (user.otpExpires < new Date()) {
      return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();
    console.log("✅ User verified:", email);

    res.status(200).json({ success: true, message: "Email verified successfully! Please login." });

  } catch (error) {
    console.error("❌ Verify OTP error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ RESEND OTP
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (user.isVerified) return res.status(400).json({ success: false, message: "User already verified" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendEmail(email, otp);
    console.log("✅ OTP resent to:", email);

    res.status(200).json({ success: true, message: "OTP resent successfully" });

  } catch (error) {
    console.error("❌ Resend OTP error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ LOGIN — isVerified check PASSWORD SE PEHLE
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

    // ✅ PEHLE verify check
    if (!user.isVerified) {
      return res.status(403).json({ success: false, message: 'Please verify your email first', email });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid email or password' });

    const token = generateToken(user);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ✅ SOCIAL LOGIN
router.post('/social', async (req, res) => {
  try {
    const { email, fullName, provider, googleId, picture } = req.body;
    let user = await User.findOne({ email });

    if (!user) {
      user = new User({
        email,
        fullName: fullName || email.split('@')[0],
        password: null,
        phone: '',
        address: '',
        isVerified: true,
        authProvider: provider === 'google' ? 'google' : 'local',
        googleId: googleId || undefined,
        googleProfile: { displayName: fullName, picture },
        profileImage: picture || ''
      });
      await user.save();
    }

    const token = generateToken(user);
    res.json({ success: true, message: `Logged in with ${provider}`, token, user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role } });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ✅ FORGOT PASSWORD
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const resetToken = Math.random().toString(36).slice(2);
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();

    res.json({ success: true, message: 'Password reset instructions sent to your email' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ✅ RESET PASSWORD
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ✅ VERIFY TOKEN
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    res.json({ success: true, user });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

module.exports = router;