const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    minlength: [6, 'Password must be at least 6 characters'],
    default: null
  },
  phone: {
    type: String,
    match: [/^[0-9]{10,15}$/, 'Please enter a valid phone number'],
    default: ''
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
    pushNotifications: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: false }
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  otp: {
    type: String
  },
  otpExpires: {
    type: Date
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,

  // =============== GOOGLE OAUTH FIELDS ===============
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  googleProfile: {
    displayName: String,
    picture: String
  }
  // ===================================================
}, {
  timestamps: true
});

// Hash password before saving (only if password is modified)
userSchema.pre('save', async function(next) {
  if (!this.password || !this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// ✅ Normal response ke liye - OTP fields hidden
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.verificationToken;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  delete obj.otp;        // ✅ Normal response mein hidden rahega
  delete obj.otpExpires; // ✅ Normal response mein hidden rahega
  return obj;
};

// ✅ Jab OTP include karna ho tab yeh method use karo
userSchema.methods.toJSONWithOTP = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.verificationToken;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  // OTP fields DELETE NAHI ho rahe ✅
  return obj;
};

module.exports = mongoose.model('User', userSchema);