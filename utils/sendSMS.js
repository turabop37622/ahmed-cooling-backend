const axios = require('axios');

const sendSMS = async (phone, otp) => {
  const cleanPhone = phone.replace(/^\+/, '');
  const fullPhone = phone.startsWith('+') ? phone : `+${phone}`;

  console.log('📲 Sending SMS OTP to:', fullPhone);

  if (!process.env.BREVO_API_KEY) {
    console.log('⚠️ BREVO_API_KEY not set, OTP logged to console');
    console.log(`📲 OTP for ${fullPhone}: ${otp}`);
    return { fallback: true };
  }

  try {
    const response = await axios.post(
      'https://api.brevo.com/v3/transactionalSMS/sms',
      {
        sender: 'AhmedCool',
        recipient: fullPhone,
        content: `Ahmed Cooling: Your verification code is ${otp}. Valid for 10 minutes. Do not share this code.`,
        type: 'transactional',
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ SMS sent successfully. MessageId:', response.data?.messageId);
    return { success: true, messageId: response.data?.messageId };
  } catch (err) {
    console.error('❌ SMS send failed:', err.response?.data || err.message);
    throw err;
  }
};

module.exports = sendSMS;
