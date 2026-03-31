const axios = require('axios');

const sendWhatsAppOTP = async (phone, otp) => {
  const cleanPhone = phone.replace(/^\+/, '');

  console.log('📱 Sending WhatsApp OTP to:', cleanPhone);
  console.log('📱 BREVO_API_KEY exists:', !!process.env.BREVO_API_KEY);
  console.log('📱 WHATSAPP_SENDER_NUMBER:', process.env.WHATSAPP_SENDER_NUMBER || 'NOT SET');
  console.log('📱 WHATSAPP_TEMPLATE_ID:', process.env.WHATSAPP_TEMPLATE_ID || 'NOT SET');

  if (!process.env.WHATSAPP_SENDER_NUMBER || !process.env.WHATSAPP_TEMPLATE_ID) {
    console.log('⚠️ WhatsApp not configured, falling back to console OTP');
    console.log(`📱 OTP for ${cleanPhone}: ${otp}`);
    return { fallback: true, messageId: null };
  }

  try {
    const response = await axios.post(
      'https://api.brevo.com/v3/whatsapp/sendMessage',
      {
        senderNumber: process.env.WHATSAPP_SENDER_NUMBER,
        contactNumbers: [cleanPhone],
        templateId: parseInt(process.env.WHATSAPP_TEMPLATE_ID),
        params: { '1': otp },
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ WhatsApp OTP sent:', response.data.messageId);
    return response.data;
  } catch (err) {
    console.error('❌ WhatsApp send failed:', err.response?.data || err.message);
    throw err;
  }
};

module.exports = sendWhatsAppOTP;
