const nodemailer = require('nodemailer'); // ✅ FIX: nodemailer import add kiya

const sendEmail = async (to, otp) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const info = await transporter.sendMail({
      from: `"Ahmed Cooling Workshop" <${process.env.EMAIL_USER}>`,
      to,
      subject: 'Email Verification OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 400px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
          <h2 style="color: #2196F3; text-align: center;">Email Verification</h2>
          <p style="color: #333;">Your OTP verification code is:</p>
          <h1 style="color: #2196F3; text-align: center; letter-spacing: 8px;">${otp}</h1>
          <p style="color: #666; font-size: 13px;">This OTP expires in <strong>10 minutes</strong>.</p>
          <p style="color: #666; font-size: 13px;">If you did not request this, please ignore this email.</p>
        </div>
      `
    });

    console.log("📧 Email sent:", info.response);

  } catch (error) {
    console.log("❌ EMAIL ERROR:", error);
    throw error; // ✅ FIX: error throw karo taake register mein catch ho sake
  }
};

module.exports = sendEmail; // ✅ FIX: export add kiya