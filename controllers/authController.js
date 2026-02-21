const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const jwt = require("jsonwebtoken");

// ================================
// VERIFY OTP
// ================================
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    console.log("🔍 Verifying OTP for:", email, "OTP:", otp);

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    if (user.otpExpires < new Date()) {
      return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    // ✅ UPDATED - userId aur role dono include karo
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || 'ahmed-cooling-secret-key-2024-secure-token',
      { expiresIn: "7d" }
    );

    console.log("✅ User verified:", email, "ID:", user._id);

    res.status(200).json({
      success: true,
      message: "Email verified successfully!",
      token,
      user: user.toJSON(),
      userId: user._id  // ✅ Frontend ke liye userId
    });

  } catch (error) {
    console.log("❌ VERIFY OTP ERROR:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================================
// RESEND OTP
// ================================
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, message: "User already verified" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendEmail(email, otp);
    console.log("✅ OTP resent to:", email);

    res.status(200).json({ success: true, message: "OTP resent successfully" });

  } catch (error) {
    console.log("❌ RESEND OTP ERROR:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================================
// LOGIN
// ================================
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid email or password" });
    }

    // ✅ PEHLE verify check
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first",
        email
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Invalid email or password" });
    }

    // ✅ UPDATED - userId aur role include karo
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || 'ahmed-cooling-secret-key-2024-secure-token',
      { expiresIn: "7d" }
    );

    console.log("✅ Login successful:", email, "ID:", user._id);

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: user.toJSON(),
      userId: user._id  // ✅ Frontend ke liye userId
    });

  } catch (error) {
    console.log("❌ LOGIN ERROR:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================================
// REFRESH TOKEN
// ================================
exports.refreshToken = async (req, res) => {
  try {
    const { token } = req.body;
    const JWT_SECRET = process.env.JWT_SECRET || 'ahmed-cooling-secret-key-2024-secure-token';
    
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // ✅ NAYA token banao
    const newToken = jwt.sign(
      { userId: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log("✅ Token refreshed for user:", user._id);

    res.status(200).json({
      success: true,
      message: "Token refreshed",
      token: newToken,
      userId: user._id
    });

  } catch (error) {
    console.log("❌ REFRESH TOKEN ERROR:", error);
    res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};