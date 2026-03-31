const axios = require('axios');

const sendWhatsAppOTP = async (phone, otp) => {
  const cleanPhone = phone.replace(/^\+/, '').replace(/\s/g, '');

  console.log('📱 Sending WhatsApp OTP to:', cleanPhone);

  const message = `🔒 *Ahmed Cooling Workshop*\n\nYour verification code is: *${otp}*\n\nValid for 10 minutes. Do not share this code.`;

  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}&text=${encodeURIComponent(message)}&apikey=`;

    const res = await axios.get(url, { timeout: 15000 });

    if (res.status === 200) {
      console.log('✅ WhatsApp OTP sent via CallMeBot');
      return { success: true };
    }
    throw new Error('CallMeBot returned non-200');
  } catch (err) {
    console.error('❌ WhatsApp OTP failed:', err.message);
    throw err;
  }
};

module.exports = sendWhatsAppOTP;
