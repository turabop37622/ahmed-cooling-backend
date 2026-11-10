// Photos and voice notes sent to the WhatsApp number.
//  - a photo is saved on the customer's latest active booking (Cloudinary) so the technician sees the fault;
//  - a voice note is turned into text (Groq Whisper) and then handled exactly like a typed message.
const axios = require('axios');
const cloudinary = require('./cloudinary');
const Booking = require('../models/Booking');
const { sendTextMessage, sendButtonsMessage } = require('./whatsappCloud');
const { logMessage } = require('./whatsappConversationStore');
const { phoneVariants } = require('./phone');

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';
const ACCESS_TOKEN = process.env.WHATSAPP_CLOUD_API_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
// The full model: the turbo one turned Urdu and Punjabi voice notes into nonsense English
const WHISPER_MODEL = process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3';
// Context for the speech-to-text: what the business is and the words customers use, so it spells them right
const WHISPER_PROMPT = 'Customer voice message to Ahmed Cooling Workshop, an AC and home appliance repair service in Jeddah and Makkah. '
  + 'AC, split AC, outdoor unit, compressor, gas, PCB, fridge, washing machine. مكيف، ثلاجة، غسالة، جدة، مكة. '
  + 'Aap ka AC theek karna hai, technician bhej dein.';
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS_PER_BOOKING = 6;
const ACTIVE = ['pending', 'confirmed', 'assigned', 'on_the_way', 'in_progress'];

const L = (isAr, en, ar) => (isAr ? ar : en);
const cloudinaryReady = () => !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

// Meta gives an id; the file itself sits behind a short-lived URL that needs the same token.
const downloadMedia = async (mediaId) => {
  const headers = { Authorization: `Bearer ${ACCESS_TOKEN}` };
  const { data: meta } = await axios.get(`https://graph.facebook.com/${API_VERSION}/${encodeURIComponent(mediaId)}`, { headers, timeout: 15000 });
  if (!meta.url) throw new Error('Media URL missing');
  const { data } = await axios.get(meta.url, { headers, responseType: 'arraybuffer', timeout: 30000, maxContentLength: MAX_BYTES });
  return { buffer: Buffer.from(data), mime: meta.mime_type || 'application/octet-stream' };
};

const uploadPhoto = (buffer, folder) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream({ folder, resource_type: 'image' }, (err, result) => (err ? reject(err) : resolve(result)));
  stream.end(buffer);
});

const reply = async (phone, body, buttons) => {
  try {
    if (buttons) await sendButtonsMessage(phone, body, buttons);
    else await sendTextMessage(phone, body);
  } catch { await sendTextMessage(phone, body).catch(() => {}); }
  await logMessage(phone, 'out', buttons ? `${body} [${buttons.map((b) => b.title).join(' / ')}]` : body, { messageType: buttons ? 'button' : 'text', sentBy: 'bot' });
};

// A photo. Returns true when handled; false lets the caller say photos cannot be read here.
const handleImage = async (phone, message, isAr, conversation) => {
  const mediaId = message.image && message.image.id;
  if (!mediaId || !cloudinaryReady() || !ACCESS_TOKEN) return false;
  const booking = await Booking.findOne({ phone: { $in: phoneVariants(phone) }, status: { $in: ACTIVE }, deletedAt: null }).sort({ createdAt: -1 });
  if (!booking) {
    // In the middle of the WhatsApp booking chat: keep the photo, it is added to the booking once it is made
    const draft = conversation && conversation.bookingDraft;
    if (draft && draft.step) {
      try {
        const { buffer } = await downloadMedia(mediaId);
        const result = await uploadPhoto(buffer, 'whatsapp-bookings');
        const images = [...(draft.images || []), result.secure_url].slice(0, MAX_PHOTOS_PER_BOOKING);
        await require('./whatsappBookingFlow').setDraft(phone, { ...draft, images });
        await reply(phone, L(isAr, 'Got the photo 👍 It will be added to your booking for the technician.', 'وصلت الصورة 👍 ستُضاف إلى حجزك ليراها الفني.'));
      } catch (err) {
        console.error('❌ WhatsApp photo (booking chat) failed:', err.response?.data?.error?.message || err.message);
        await reply(phone, L(isAr, 'Sorry, I could not save that photo — please send it again.', 'عذراً، تعذر حفظ الصورة — أرسلها مرة أخرى من فضلك.'));
      }
      return true;
    }
    await reply(phone, L(isAr,
      'Thanks for the photo 👍 What seems to be the problem? Tell me a little and I can book a technician for you.',
      'شكراً على الصورة 👍 ما المشكلة بالضبط؟ أخبرني باختصار وأحجز لك زيارة فني.'),
    [{ id: 'menu_book', title: L(isAr, 'Book a service', 'حجز خدمة') }]);
    return true;
  }
  if ((booking.images || []).length >= MAX_PHOTOS_PER_BOOKING) {
    await reply(phone, L(isAr, `This booking already has ${MAX_PHOTOS_PER_BOOKING} photos — that is the maximum.`, `هذا الحجز يحتوي بالفعل على ${MAX_PHOTOS_PER_BOOKING} صور — وهو الحد الأقصى.`));
    return true;
  }
  try {
    const { buffer } = await downloadMedia(mediaId);
    const result = await uploadPhoto(buffer, 'whatsapp-bookings');
    await Booking.updateOne({ _id: booking._id }, { $push: { images: result.secure_url } });
    await reply(phone, L(isAr,
      `Photo received and added to booking #${booking.orderNumber}. The technician will see it.`,
      `تم استلام الصورة وإضافتها إلى الحجز #${booking.orderNumber}. سيراها الفني.`));
  } catch (err) {
    console.error('❌ WhatsApp photo failed:', err.response?.data?.error?.message || err.message);
    await reply(phone, L(isAr, 'Sorry, I could not save that photo. Please try again, or tap "Talk to our team".', 'عذراً، تعذر حفظ الصورة. حاول مرة أخرى أو اختر «تحدث مع فريقنا».'));
  }
  return true;
};

// A location pin sent outside the booking chat — in the chats, customers sent their pin right after the confirmation
// message and were told "I can only read text". It now goes onto their latest active booking for the technician.
// Returns true when handled; false (no usable pin) lets the caller answer as before.
const handleLocation = async (phone, location, isAr) => {
  const lat = Number(location && location.latitude);
  const lng = Number(location && location.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  const booking = await Booking.findOne({ phone: { $in: phoneVariants(phone) }, status: { $in: ACTIVE }, deletedAt: null }).sort({ createdAt: -1 });
  if (!booking) {
    await reply(phone, L(isAr,
      'Thanks for your location! 📍 To book a technician, tap "Book a service" below — you can share the location again in the booking.',
      'شكراً على مشاركة موقعك! 📍 لحجز فني اضغط «حجز خدمة» أدناه، ويمكنك مشاركة الموقع مرة أخرى أثناء الحجز.'),
    [{ id: 'menu_book', title: L(isAr, 'Book a service', 'حجز خدمة') }, { id: 'menu_human', title: L(isAr, 'Talk to our team', 'تحدث مع فريقنا') }]);
    return true;
  }
  await Booking.updateOne({ _id: booking._id }, {
    $set: { coordinates: { latitude: lat, longitude: lng }, location: { type: 'Point', coordinates: [lng, lat] } },
  });
  await reply(phone, L(isAr,
    `Location received 📍 We added it to booking #${booking.orderNumber} so the technician can find you easily.`,
    `تم استلام موقعك 📍 أضفناه إلى الحجز رقم ${booking.orderNumber} ليسهل على الفني الوصول إليك.`));
  return true;
};

// A voice note -> text, or null if it cannot be transcribed. `language`: 'ar' for an Arabic chat (Whisper then never
// mistakes it for another language); anything else is left to Whisper to detect.
const transcribe = async (message, { language } = {}) => {
  const audio = message.audio || message.voice;
  if (!audio || !audio.id || !GROQ_API_KEY || !ACCESS_TOKEN) return null;
  try {
    const { buffer, mime } = await downloadMedia(audio.id);
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mime }), 'voice.ogg');
    form.append('model', WHISPER_MODEL);
    form.append('response_format', 'json');
    form.append('prompt', WHISPER_PROMPT);
    if (language === 'ar') form.append('language', 'ar');
    const { data } = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', form, {
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, timeout: 30000, maxBodyLength: MAX_BYTES,
    });
    const text = String(data.text || '').trim().slice(0, 1000);
    return text || null;
  } catch (err) {
    console.error('❌ WhatsApp voice transcription failed:', err.response?.data?.error?.message || err.message);
    return null;
  }
};

module.exports = { handleImage, handleLocation, transcribe };
