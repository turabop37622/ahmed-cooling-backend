// WhatsApp messages for technician dispatch (utils/dispatch.js): an open job to the technicians, and "your technician is
// ..." to the customer. These are business-initiated, so Meta needs an approved template outside the 24h window:
//   WHATSAPP_TECH_OFFER_TEMPLATE        body: 3 variables  {{1}} service  {{2}} when  {{3}} area
//   WHATSAPP_CUSTOMER_ASSIGNED_TEMPLATE body: 4 variables  {{1}} customer {{2}} order number {{3}} technician {{4}} technician phone
//     (+ optional image header with the technician's photo: WHATSAPP_CUSTOMER_ASSIGNED_IMAGE=1)
// Both use WHATSAPP_DISPATCH_TEMPLATE_LANG (default en_US). While a template name is not configured, a plain text message
// is tried instead (Meta delivers it only if the person messaged this number in the last 24 hours). A send never throws:
// the app push notification (utils/notify.js) is the main channel, WhatsApp is the extra one.
const whatsappCloud = require('./whatsappCloud');
const { logMessage } = require('./whatsappConversationStore');
const { normalizePhone } = require('./phone');

const LANG = process.env.WHATSAPP_DISPATCH_TEMPLATE_LANG || 'en_US';
const TECH_OFFER_TEMPLATE = process.env.WHATSAPP_TECH_OFFER_TEMPLATE || '';
const CUSTOMER_ASSIGNED_TEMPLATE = process.env.WHATSAPP_CUSTOMER_ASSIGNED_TEMPLATE || '';
// Set to 1 when that template has an IMAGE header: the technician's photo (or the logo when there is none) goes in it.
const CUSTOMER_ASSIGNED_IMAGE = /^(1|true|yes)$/i.test(process.env.WHATSAPP_CUSTOMER_ASSIGNED_IMAGE || '');
const DEFAULT_PHOTO = process.env.WHATSAPP_DEFAULT_TECH_IMAGE || 'https://www.ahmedcoolingworkshop.com/logo-square.png';

const serviceName = (booking) => {
  const svc = booking.service && typeof booking.service === 'object' ? booking.service : {};
  return { en: svc.name || booking.serviceDetails?.name || 'Service', ar: svc.name_ar || svc.nameAr || svc.name || booking.serviceDetails?.name || 'خدمة' };
};
const whenText = (booking) => (booking.date ? [booking.date, booking.time].filter(Boolean).join(' ') : 'Flexible');
const areaText = (booking) => String(booking.city || String(booking.address || '').split(',')[0] || '').trim().slice(0, 40) || '-';

const send = async (phone, templateName, params, fallbackText, { headerImage } = {}) => {
  try {
    if (!whatsappCloud.isConfigured() || !phone) return false;
    const to = normalizePhone(phone);
    if (templateName) {
      const components = [
        { type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text || '-').slice(0, 200) })) },
      ];
      if (headerImage) components.unshift({ type: 'header', parameters: [{ type: 'image', image: { link: headerImage } }] });
      await whatsappCloud.sendTemplateMessage(to, templateName, LANG, components);
      await logMessage(to, 'out', `[Template: ${templateName}] ${fallbackText}`, { messageType: 'template', sentBy: 'bot' });
    } else {
      await whatsappCloud.sendTextMessage(to, fallbackText);
      await logMessage(to, 'out', fallbackText, { messageType: 'text', sentBy: 'bot' });
    }
    return true;
  } catch (err) {
    console.error('⚠️ Dispatch WhatsApp send failed:', err.response?.data?.error?.message || err.message);
    return false;
  }
};

// An open booking, to one technician.
const offerToTechnician = (technician, booking, { late = false } = {}) => {
  const s = serviceName(booking);
  const text = late
    ? `Late job available: ${s.en} · ${whenText(booking)} · ${areaText(booking)}. Open the technician app to take it.\nمهمة متأخرة متاحة: ${s.ar}. افتح التطبيق لأخذها.`
    : `New job: ${s.en} · ${whenText(booking)} · ${areaText(booking)}. Open the technician app to accept it — first to accept gets it.\nمهمة جديدة: ${s.ar}. افتح التطبيق للقبول، الأسرع يحصل عليها.`;
  return send(technician.phone, TECH_OFFER_TEMPLATE, [s.en, whenText(booking), areaText(booking)], text);
};

// The late technician himself.
const lateToTechnician = (technician, booking) => send(
  technician.phone, '', [],
  `Booking #${booking.orderNumber} is overdue. Contact the customer now — it may be given to another technician.\nالحجز رقم ${booking.orderNumber} متأخر. تواصل مع العميل الآن، وقد يُسند لفني آخر.`
);

// Customer: a technician took the booking.
const assignedToCustomer = (booking, technician) => {
  const isAr = booking.language === 'ar';
  const name = booking.customerName || (isAr ? 'عميلنا' : 'Customer');
  const text = isAr
    ? `مرحباً ${name}، تم قبول حجزك رقم ${booking.orderNumber} من الفني ${technician.fullName}${technician.phone ? ` (${technician.phone})` : ''}. سيتواصل معك قريباً.`
    : `Hello ${name}, your booking #${booking.orderNumber} was taken by technician ${technician.fullName}${technician.phone ? ` (${technician.phone})` : ''}. They will contact you shortly.`;
  const photo = /^https:\/\//.test(technician.profileImage || '') ? technician.profileImage : DEFAULT_PHOTO;
  return send(booking.phone, CUSTOMER_ASSIGNED_TEMPLATE, [name, booking.orderNumber, technician.fullName, technician.phone || '-'], text,
    { headerImage: CUSTOMER_ASSIGNED_IMAGE ? photo : undefined });
};

// Customer: the technician gave it back, we are finding another.
const technicianChangedToCustomer = (booking) => {
  const isAr = booking.language === 'ar';
  return send(booking.phone, '', [], isAr
    ? `مرحباً، تعذّر على الفني تنفيذ حجزك رقم ${booking.orderNumber}. نبحث لك عن فني آخر وسنبلغك فور تعيينه.`
    : `Hello, your technician could not make it for booking #${booking.orderNumber}. We are finding you another one and will let you know as soon as they accept.`);
};

// The applicant: the admin approved or rejected the technician application (plain text — it only lands if they messaged
// us in the last 24 hours, otherwise the app login message explains the result).
const applicationDecision = (application, approved) => send(
  application.phone, '', [],
  approved
    ? `Hello ${application.fullName}, your Ahmed Cooling technician application was approved. Log in to the technician app with your phone number and password.
مرحباً ${application.fullName}، تمت الموافقة على طلبك. سجّل الدخول في تطبيق الفنيين برقم جوالك وكلمة المرور.`
    : `Hello ${application.fullName}, your Ahmed Cooling technician application was not approved: ${application.rejectionReason}
مرحباً ${application.fullName}، لم تتم الموافقة على طلبك: ${application.rejectionReason}`
);

module.exports = { offerToTechnician, lateToTechnician, assignedToCustomer, technicianChangedToCustomer, applicationDecision };
