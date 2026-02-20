const nodemailer = require('nodemailer');

const sendEmail = async (to, otp) => {
  console.log("📧 Attempting to send email to:", to);
  console.log("📧 EMAIL_USER:", process.env.EMAIL_USER);
  console.log("📧 EMAIL_PASS exists:", !!process.env.EMAIL_PASS);

  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  const mailOptions = {
    from: `"Ahmed Cooling Workshop" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Email Verification OTP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 400px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #2196F3; text-align: center;">Email Verification</h2>
        <p>Your OTP verification code is:</p>
        <h1 style="color: #2196F3; text-align: center; letter-spacing: 8px;">${otp}</h1>
        <p style="color: #666; font-size: 13px;">This OTP expires in <strong>10 minutes</strong>.</p>
      </div>
    `
  };

  const info = await transporter.sendMail(mailOptions);
  console.log("✅ Email sent successfully:", info.response);
  return info;
};

module.exports = sendEmail;