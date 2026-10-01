const axios = require('axios');

const COPY = {
  verify: { subject: 'Email Verification OTP', title: 'Email Verification', intro: 'Your OTP verification code is:' },
  reset: { subject: 'Password Reset Code', title: 'Password Reset', intro: 'Your password reset code is:' },
};

// Sends a one-time code. `purpose` is 'verify' (sign-up) or 'reset' (forgot password).
const sendEmail = async (to, otp, purpose = 'verify') => {
  const copy = COPY[purpose] || COPY.verify;
  const code = String(otp).replace(/\D/g, '');
  try {
    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: {
          name: 'Ahmed Cooling Workshop',
          email: process.env.EMAIL_FROM || process.env.ADMIN_EMAIL,
        },
        to: [{ email: to }],
        subject: copy.subject,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 400px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #2196F3; text-align: center;">${copy.title}</h2>
            <p>${copy.intro}</p>
            <h1 style="color: #2196F3; text-align: center; letter-spacing: 8px;">${code}</h1>
            <p style="color: #666; font-size: 13px;">This code expires in <strong>10 minutes</strong>. If you did not request it, ignore this email.</p>
          </div>
        `,
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    return response.data;
  } catch (err) {
    console.error('❌ Email send failed:', err.response?.data || err.message);
    throw err;
  }
};

module.exports = sendEmail;
