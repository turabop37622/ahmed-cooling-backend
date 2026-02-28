const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },

  // ── Email auth ──
  email: {
    type: String,
    unique: true,
    sparse: true,        // ✅ phone-only users ke liye null allow
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },

  password: {
    type: String,
    minlength: [6, 'Password must be at least 6 characters'],
    default: null
  },

  // ── Phone auth (NEW) ──
  phone: {
    type: String,
    unique: true,
    sparse: true,        // ✅ email-only users ke liye null allow
    trim: true,
    default: null
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },

  address: {
    type: String,
    default: ''
  },
  profileImage: {
    type: String,
    default: ''
  },
  role: {
    type: String,
    enum: ['customer', 'technician', 'admin'],
    default: 'customer'
  },
  language: {
    type: String,
    enum: ['en', 'ar'],
    default: 'en'
  },
  settings: {
    pushNotifications:  { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: true },
    smsNotifications:   { type: Boolean, default: false }
  },

  // ── Email verification ──
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  otp:        { type: String },
  otpExpires: { type: Date },

  // ── Password reset ──
  resetPasswordToken:   String,
  resetPasswordExpires: Date,

  // ── Google OAuth ──
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  authProvider: {
    type: String,
    enum: ['local', 'phone', 'google'],  // ✅ 'phone' add kiya
    default: 'local'
  },
  googleProfile: {
    displayName: String,
    picture:     String
  }

}, { timestamps: true });

// ─────────────────────────────────────────
//  Pre-save: hash password
// ─────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.password || !this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────
//  Instance methods
// ─────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Normal response — OTP/password hidden
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.verificationToken;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  delete obj.otp;
  delete obj.otpExpires;
  return obj;
};

// Jab OTP include karna ho
userSchema.methods.toJSONWithOTP = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.verificationToken;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);