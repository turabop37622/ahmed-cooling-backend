const axios = require('axios');

const sendEmail = async (to, otp) => {
  console.log("📧 Attempting to send email to:", to);
  console.log("📧 BREVO_API_KEY exists:", !!process.env.BREVO_API_KEY);

  try {
    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: {
          name: "Ahmed Cooling Workshop",
          email: "a2de6b001@smtp-brevo.com"
        },
        to: [{ email: to }],
        subject: 'Email Verification OTP',
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 400px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #2196F3; text-align: center;">Email Verification</h2>
            <p>Your OTP verification code is:</p>
            <h1 style="color: #2196F3; text-align: center; letter-spacing: 8px;">${otp}</h1>
            <p style="color: #666; font-size: 13px;">This OTP expires in <strong>10 minutes</strong>.</p>
          </div>
        `
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log("✅ Email sent successfully:", response.data.messageId);
    return response.data;
  } catch (err) {
    console.error("❌ Email send failed:", err.response?.data || err.message);
    throw err;
  }
};

module.exports = sendEmail;