const sendEmail = require('../utils/sendEmail');
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const User = require('../models/User');
const { normalizePhone, phoneVariants, validatePhone } = require('../utils/phone');
const { cleanStr, normEmail, isEmail, isValidPassword, burnPasswordCheck, PASSWORD_MIN, PASSWORD_MAX } = require('../utils/security');
const { PURPOSE_VERIFY, PURPOSE_RESET, canIssueOtp, issueOtp, clearOtp, checkOtp, saveQuiet } = require('../utils/otp');

const JWT_SECRET = process.env.JWT_SECRET;
// The Google client ID is public (it is embedded in the website), so a default is safe.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '506685890879-rcuen5qa0bom1f4asc89ah29k8ernt59.apps.googleusercontent.com';
// Extra client IDs (e.g. Android/iOS apps) can be listed in GOOGLE_CLIENT_IDS, comma separated.
const GOOGLE_AUDIENCES = [GOOGLE_CLIENT_ID, ...(process.env.GOOGLE_CLIENT_IDS || '').split(',').map((v) => v.trim()).filter(Boolean)];

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: user.role === 'admin' ? '8h' : '30d' }
  );
};

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

const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail.com', 'mailinator.com', 'guerrillamail.com', 'yopmail.com', '10minutemail.com',
  'trashmail.com', 'temp-mail.org', 'dispostable.com', 'getnada.com', 'dropmail.me',
  'guerrillamail.biz', 'guerrillamail.de', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamailblock.com', 'spam4.me', 'grr.la', 'teleworm.us', 'dayrep.com', 'fleeing.cc',
  'gixpos.com', 'vintomland.com', 'tempm.com', 'mail.tm', 'mail.gw', 'moakt.com',
];

const isDisposableEmail = async (email) => {
  if (!email) return false;
  const domain = email.split('@')[1]?.toLowerCase();
  if (DISPOSABLE_EMAIL_DOMAINS.includes(domain)) return true;
  try {
    // Only the domain is sent to the third-party checker (not the whole address).
    const response = await axios.get(`https://open.kickbox.com/v1/disposable/${encodeURIComponent(domain)}`, { timeout: 3000 });
    return response.data.disposable === true;
  } catch {
    return false;
  }
};

const maskEmail = (email) => {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}***@${domain}`;
};

const invalidCode = (res) => res.status(400).json({ success: false, message: 'Invalid or expired code' });

// An account that never finished sign-up (email not verified, phone never verified) has never proved it
// belongs to anybody, so a new sign-up may replace it. Verified accounts are never touched.
const isStaleUnverified = (user) => !!user && !user.isVerified && !user.isPhoneVerified && user.role === 'customer';

const removeStale = async (...users) => {
  const seen = new Set();
  for (const user of users) {
    if (user && !seen.has(String(user._id))) {
      seen.add(String(user._id));
      await User.deleteOne({ _id: user._id });
    }
  }
};

// ================================
// EMAIL: REGISTER
// ================================
router.post('/register', async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    const userName = cleanStr(req.body.fullName || req.body.name, 100);
    const { password } = req.body;
    const phone = cleanStr(req.body.phone, 30);
    const address = cleanStr(req.body.address, 500);

    if (!isEmail(email)) return res.status(400).json({ success: false, message: 'Please enter a valid email' });
    if (!isValidPassword(password)) {
      return res.status(400).json({ success: false, message: `Password must be ${PASSWORD_MIN} to ${PASSWORD_MAX} characters` });
    }
    if (!userName) return res.status(400).json({ success: false, message: 'Full name is required' });
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required' });
    const phoneCheck = validatePhone(phone);
    if (!phoneCheck.valid) return res.status(400).json({ success: false, message: phoneCheck.msg });
    if (await isDisposableEmail(email)) {
      return res.status(400).json({ success: false, message: 'Disposable email addresses are not allowed. Please use a permanent email.' });
    }

    const normalizedPhone = normalizePhone(phone);

    // Look at both first and only delete stale rows once we know the sign-up can go ahead.
    const existingUser = await User.findOne({ email });
    const existingPhone = await User.findOne({ phone: { $in: phoneVariants(phone) } });
    if (existingUser && !isStaleUnverified(existingUser)) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }
    if (existingPhone && !isStaleUnverified(existingPhone)) {
      return res.status(400).json({ success: false, message: 'This phone number is already registered' });
    }
    await removeStale(existingUser, existingPhone);

    const user = new User({
      fullName: userName,
      email,
      password,
      phone: normalizedPhone,
      address,
      isVerified: false,
      authProvider: 'local',
    });
    await user.save();
    const otp = await issueOtp(user, PURPOSE_VERIFY);

    // The code goes to the email address, which proves the person owns it.
    try {
      await sendEmail(email, otp, PURPOSE_VERIFY, { name: user.fullName });
    } catch (emailErr) {
      console.error('❌ Verification email failed:', emailErr.message);
      return res.status(502).json({ success: false, message: 'Could not send the verification code. Please try again.' });
    }

    res.status(201).json({
      success: true,
      message: 'OTP sent to your email.',
      email,
      phone: normalizedPhone.slice(0, 4) + '****' + normalizedPhone.slice(-3),
      otpSentVia: 'email',
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================================
// VERIFY OTP — email or phone
// ================================
router.post('/verify-otp', async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    const phone = typeof req.body.phone === 'string' ? req.body.phone : '';
    const { otp } = req.body;
    if (!email && !phone) return invalidCode(res);

    // By phone number only for accounts created through phone sign-up; email accounts verify by email.
    const user = email
      ? await User.findOne({ email })
      : await User.findOne({ phone: { $in: phoneVariants(phone) }, authProvider: 'phone' });
    if (!user || (user.isVerified && user.isPhoneVerified)) return invalidCode(res);
    if (!(await checkOtp(user, otp, PURPOSE_VERIFY))) return invalidCode(res);

    user.isVerified = true;
    // "phone verified" only means the person finished phone sign-up (the code is emailed, not texted).
    if (user.authProvider === 'phone') user.isPhoneVerified = true;
    clearOtp(user);
    await saveQuiet(user);

    const token = generateToken(user);
    return res.status(200).json({
      success: true,
      message: 'Account verified successfully! Welcome to Ahmed Cooling.',
      token,
      userId: user._id.toString(),
      user: userResponse(user),
    });
  } catch (error) {
    console.error('❌ Verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================================
// RESEND OTP (always answers the same, so it cannot be used to find registered emails)
// ================================
router.post('/resend-otp', async (req, res) => {
  const generic = { success: true, message: 'If this account still needs verification, a new code has been sent.', otpSentVia: 'email' };
  try {
    const email = normEmail(req.body.email);
    const phone = typeof req.body.phone === 'string' ? req.body.phone : '';
    if (!email && !phone) return res.status(200).json(generic);

    const user = email
      ? await User.findOne({ email })
      : await User.findOne({ phone: { $in: phoneVariants(phone) }, authProvider: 'phone' });

    if (!user || user.isVerified || user.role !== 'customer' || !user.email || !canIssueOtp(user)) {
      return res.status(200).json(generic);
    }
    const otp = await issueOtp(user, PURPOSE_VERIFY);
    try {
      await sendEmail(user.email, otp, PURPOSE_VERIFY, { name: user.fullName });
    } catch (emailErr) {
      console.error('❌ Resend email failed:', emailErr.message);
    }
    res.status(200).json(generic);
  } catch (error) {
    console.error('❌ Resend OTP error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================================
// EMAIL: LOGIN
// ================================
router.post('/login', async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    const { password } = req.body;
    if (!isEmail(email)) return res.status(400).json({ success: false, message: 'Please enter a valid email' });
    if (typeof password !== 'string' || !password || password.length > 200) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      await burnPasswordCheck(password);
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid email or password' });

    // Admins sign in only through /api/admin/login (its own limits and shorter session); checked after the
    // password so this answer never reveals which emails belong to an admin.
    if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Use the admin login' });

    if (!user.isVerified) {
      return res.status(403).json({ success: false, message: 'Please verify your email first', email });
    }

    const token = generateToken(user);
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
// PHONE: REGISTER — OTP via email
// ================================
router.post('/phone/register', async (req, res) => {
  try {
    const userName = cleanStr(req.body.fullName || req.body.name, 100);
    const phone = cleanStr(req.body.phone, 30);
    const email = normEmail(req.body.email);
    const { password } = req.body;

    if (!userName || !phone || !password) {
      return res.status(400).json({ success: false, message: 'Name, phone and password are required' });
    }
    if (!isEmail(email)) return res.status(400).json({ success: false, message: 'A valid email is required for OTP verification' });
    if (!isValidPassword(password)) {
      return res.status(400).json({ success: false, message: `Password must be ${PASSWORD_MIN} to ${PASSWORD_MAX} characters` });
    }
    const phoneCheck = validatePhone(phone);
    if (!phoneCheck.valid) return res.status(400).json({ success: false, message: phoneCheck.msg });
    if (await isDisposableEmail(email)) {
      return res.status(400).json({ success: false, message: 'Disposable email addresses are not allowed. Please use a permanent email.' });
    }

    const normalizedPhone = normalizePhone(phone);

    // An existing account is never overwritten — only accounts that never finished sign-up are replaced.
    const existingPhone = await User.findOne({ phone: { $in: phoneVariants(phone) } });
    const existingEmail = await User.findOne({ email });
    if (existingPhone && !isStaleUnverified(existingPhone)) {
      return res.status(409).json({ success: false, message: 'Phone already registered. Please sign in.' });
    }
    if (existingEmail && !isStaleUnverified(existingEmail)) {
      return res.status(409).json({ success: false, message: 'This email is already registered. Please sign in.' });
    }
    await removeStale(existingPhone, existingEmail);

    const user = new User({
      fullName: userName, phone: normalizedPhone, email, password,
      authProvider: 'phone', isPhoneVerified: false, isVerified: false,
    });
    await user.save();
    const otp = await issueOtp(user, PURPOSE_VERIFY);

    try {
      await sendEmail(email, otp, PURPOSE_VERIFY, { name: user.fullName });
    } catch (emailErr) {
      console.error('❌ Verification email failed:', emailErr.message);
      return res.status(502).json({ success: false, message: 'Could not send the verification code. Please try again.' });
    }

    res.status(201).json({ success: true, message: 'OTP sent to your email.' });
  } catch (error) {
    console.error('❌ Phone register error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================================
// PHONE: LOGIN
// ================================
router.post('/phone/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (typeof phone !== 'string' || typeof password !== 'string' || !phone || !password || password.length > 200) {
      return res.status(400).json({ success: false, message: 'Phone and password are required' });
    }

    const user = await User.findOne({ phone: { $in: phoneVariants(phone) } });
    if (!user) return res.status(401).json({ success: false, message: 'Invalid phone number or password' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid phone number or password' });

    if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Use the admin login' });

    if (user.authProvider !== 'phone') {
      return res.status(403).json({ success: false, message: 'Phone sign-in is not set up for this account. Please sign in with your email.' });
    }
    if (!user.isPhoneVerified) {
      return res.status(403).json({ success: false, message: 'Phone not verified. Please complete registration.' });
    }

    const token = generateToken(user);
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
// SOCIAL LOGIN (Google) — token is verified with Google, never trusted from the client
// ================================
router.post('/social', async (req, res) => {
  try {
    const { accessToken, idToken } = req.body;
    let fullName, googleId, picture, email;
    if (typeof idToken === 'string' && idToken) {
      // Mobile app: the Google ID token is verified by Google (signature, expiry) and its audience is checked here.
      const info = await axios.get('https://oauth2.googleapis.com/tokeninfo', { params: { id_token: idToken }, timeout: 5000 });
      const d = info.data || {};
      if (!GOOGLE_AUDIENCES.includes(d.aud) || Number(d.exp) * 1000 <= Date.now()) {
        return res.status(401).json({ success: false, message: 'Invalid Google token' });
      }
      email = normEmail(d.email);
      googleId = d.sub; fullName = d.name; picture = d.picture;
      if (!email || !googleId || !(d.email_verified === true || d.email_verified === 'true')) {
        return res.status(401).json({ success: false, message: 'Google email is not verified' });
      }
    } else {
      if (typeof accessToken !== 'string' || !accessToken) {
        return res.status(400).json({ success: false, message: 'Google login is not configured' });
      }
      const tokenInfo = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
        params: { access_token: accessToken }, timeout: 5000,
      });
      if (!GOOGLE_AUDIENCES.includes(tokenInfo.data.aud) || Number(tokenInfo.data.expires_in) <= 0) {
        return res.status(401).json({ success: false, message: 'Invalid Google token' });
      }
      const profile = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }, timeout: 5000,
      });
      ({ name: fullName, sub: googleId, picture } = profile.data);
      email = normEmail(profile.data.email);
      if (!email || !googleId || profile.data.email_verified !== true) {
        return res.status(401).json({ success: false, message: 'Google email is not verified' });
      }
    }

    let user = await User.findOne({ email });
    // A half-finished email sign-up must not block the real owner of the address from using Google.
    if (isStaleUnverified(user)) {
      await removeStale(user);
      user = null;
    }

    if (!user) {
      user = new User({
        email,
        fullName: fullName || email.split('@')[0],
        isVerified: true,
        authProvider: 'google',
        googleId,
        googleProfile: { displayName: fullName, picture },
        profileImage: picture || '',
      });
      await user.save();
    } else {
      if (user.role === 'admin' || user.role === 'technician') {
        return res.status(403).json({ success: false, message: 'Use your staff login' });
      }
      if (user.authProvider !== 'google' && user.password) {
        return res.status(409).json({ success: false, message: 'This email already uses password login' });
      }
      user.fullName = fullName || user.fullName;
      user.authProvider = 'google';
      user.isVerified = true;
      user.profileImage = picture || user.profileImage;
      user.googleProfile = { displayName: fullName, picture };
      user.googleId = googleId;
      await user.save();
    }

    const token = generateToken(user);
    res.json({ success: true, message: 'Logged in with google', token, user: userResponse(user) });
  } catch (error) {
    console.error('❌ Social login error:', error.message);
    res.status(error.response?.status === 400 || error.response?.status === 401 ? 401 : 500).json({ success: false, message: 'Google login failed' });
  }
});

// ================================
// FORGOT PASSWORD (same answer whether or not the email exists; staff accounts are excluded)
// ================================
router.post('/forgot-password', async (req, res) => {
  const generic = { success: true, message: 'If an account exists for this email, a reset code has been sent.' };
  try {
    const email = normEmail(req.body.email);
    if (!isEmail(email)) return res.status(200).json(generic);

    const user = await User.findOne({ email });
    if (!user || user.role !== 'customer' || !user.isVerified || !canIssueOtp(user)) {
      return res.status(200).json(generic);
    }
    const otp = await issueOtp(user, PURPOSE_RESET);
    try {
      await sendEmail(email, otp, PURPOSE_RESET, { name: user.fullName });
    } catch (emailError) {
      console.error('❌ Reset email send failed:', emailError.message);
    }
    res.json(generic);
  } catch (error) {
    console.error('❌ Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================================
// VERIFY RESET OTP (does not consume the code)
// ================================
router.post('/verify-reset-otp', async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    if (!isEmail(email)) return invalidCode(res);
    const user = await User.findOne({ email });
    if (!user || user.role !== 'customer' || !(await checkOtp(user, req.body.otp, PURPOSE_RESET))) return invalidCode(res);
    res.json({ success: true, message: 'OTP verified successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================================
// RESET PASSWORD — needs the email AND the code (the code alone identifies nobody)
// ================================
router.post('/reset-password/:token', async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    const { password } = req.body;
    if (!isEmail(email)) return res.status(400).json({ success: false, message: 'Email is required' });
    if (!isValidPassword(password)) {
      return res.status(400).json({ success: false, message: `Password must be ${PASSWORD_MIN} to ${PASSWORD_MAX} characters` });
    }

    const user = await User.findOne({ email });
    if (!user || user.role !== 'customer' || !(await checkOtp(user, req.params.token, PURPOSE_RESET))) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset code' });
    }

    user.password = password;
    clearOtp(user);
    await user.save();

    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    console.error('❌ Reset password error:', error);
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

    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.isVerified) return res.status(401).json({ success: false, message: 'User not found' });
    if (user.passwordChangedAt && decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    res.json({ success: true, user });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

module.exports = router;
