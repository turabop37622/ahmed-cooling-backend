// WhatsApp messages for technician dispatch (utils/dispatch.js): an open job to the technicians, and "your technician is
// ..." to the customer. These are business-initiated, so Meta needs an approved template outside the 24h window:
//   WHATSAPP_TECH_OFFER_TEMPLATE        body: 3 variables  {{1}} service  {{2}} when  {{3}} area
//   WHATSAPP_APPLICATION_RESULT_TEMPLATE body: 3 variables {{1}} name {{2}} approved / not approved {{3}} details (English | Arabic, one line)
//   WHATSAPP_CUSTOMER_ASSIGNED_TEMPLATE body: 4 variables  {{1}} customer {{2}} order number {{3}} technician {{4}} technician phone
//   WHATSAPP_ON_THE_WAY_TEMPLATE        body: 3 variables  {{1}} customer {{2}} order number {{3}} technician (name and phone)
//   WHATSAPP_COMPLETED_TEMPLATE         body: 2 variables  {{1}} customer {{2}} order number
// All use WHATSAPP_DISPATCH_TEMPLATE_LANG (default en, Meta's code for "English"). While a template name is not configured, a plain text message
// is tried instead (Meta delivers it only if the person messaged this number in the last 24 hours). A send never throws:
// the app push notification (utils/notify.js) is the main channel, WhatsApp is the extra one.
const whatsappCloud = require('./whatsappCloud');
const { logMessage } = require('./whatsappConversationStore');
const { normalizePhone } = require('./phone');

const LANG = process.env.WHATSAPP_DISPATCH_TEMPLATE_LANG || 'en';
const TECH_OFFER_TEMPLATE = process.env.WHATSAPP_TECH_OFFER_TEMPLATE || '';
const CUSTOMER_ASSIGNED_TEMPLATE = process.env.WHATSAPP_CUSTOMER_ASSIGNED_TEMPLATE || '';
const APPLICATION_RESULT_TEMPLATE = process.env.WHATSAPP_APPLICATION_RESULT_TEMPLATE || '';
const ON_THE_WAY_TEMPLATE = process.env.WHATSAPP_ON_THE_WAY_TEMPLATE || '';
const COMPLETED_TEMPLATE = process.env.WHATSAPP_COMPLETED_TEMPLATE || '';

const serviceName = (booking) => {
  const svc = booking.service && typeof booking.service === 'object' ? booking.service : {};
  return { en: svc.name || booking.serviceDetails?.name || 'Service', ar: svc.name_ar || svc.nameAr || svc.name || booking.serviceDetails?.name || 'خدمة' };
};
const whenText = (booking) => (booking.date ? [booking.date, booking.time].filter(Boolean).join(' ') : 'Flexible');
const areaText = (booking) => String(booking.city || String(booking.address || '').split(',')[0] || '').trim().slice(0, 40) || '-';

const send = async (phone, templateName, params, fallbackText) => {
  try {
    if (!whatsappCloud.isConfigured() || !phone) return false;
    const to = normalizePhone(phone);
    if (templateName) {
      await whatsappCloud.sendTemplateMessage(to, templateName, LANG, [
        { type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text || '-').slice(0, 200) })) },
      ]);
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
  return send(booking.phone, CUSTOMER_ASSIGNED_TEMPLATE, [name, booking.orderNumber, technician.fullName, technician.phone || '-'], text);
};

// Customer: the technician is on the way.
const onTheWayToCustomer = (booking, technician) => {
  const isAr = booking.language === 'ar';
  const name = booking.customerName || (isAr ? 'عميلنا' : 'Customer');
  const who = technician ? `${technician.fullName}${technician.phone ? ` (${technician.phone})` : ''}` : (isAr ? 'فريقنا' : 'our technician');
  const text = isAr
    ? `مرحباً ${name}، الفني ${who} في الطريق إليك لحجزك رقم ${booking.orderNumber}.`
    : `Hello ${name}, ${who} is on the way for your booking #${booking.orderNumber}.`;
  return send(booking.phone, ON_THE_WAY_TEMPLATE, [name, booking.orderNumber, who], text);
};

// Customer: the work is done; asks for a rating (the customer can reply here or rate in the app).
const completedToCustomer = (booking) => {
  const isAr = booking.language === 'ar';
  const name = booking.customerName || (isAr ? 'عميلنا' : 'Customer');
  const text = isAr
    ? `مرحباً ${name}، تم إنجاز حجزك رقم ${booking.orderNumber}. شكراً لاختيارك ورشة أحمد للتبريد! نسعد بتقييمك من التطبيق (حجوزاتي).`
    : `Hello ${name}, your booking #${booking.orderNumber} is complete. Thank you for choosing Ahmed Cooling Workshop! We would love your rating — open My Bookings in the app.`;
  return send(booking.phone, COMPLETED_TEMPLATE, [name, booking.orderNumber], text);
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
// decision: 'received' (just sent) | 'approved' | 'rejected' | 'changes' (the admin sent the application back; application.adminMessage says what to fix)
const applicationDecision = (application, decision) => {
  const name = application.fullName;
  const why = decision === 'rejected' ? application.rejectionReason : application.adminMessage;
  const detail = {
    received: 'Our team will check your details within 2 working days. | سيراجع فريقنا بياناتك خلال يومي عمل.',
    approved: 'You can now log in to the technician app with your mobile number and password. | يمكنك الآن تسجيل الدخول إلى تطبيق الفنيين برقم جوالك وكلمة المرور.',
    rejected: `Reason: ${why} | السبب: ${why}`,
    changes: `${why} | Open the technician app, tap Login and update your application. | افتح تطبيق الفنيين واضغط تسجيل الدخول ثم عدّل طلبك.`,
  }[decision];
  const text = {
    received: `Hello ${name}, we received your Ahmed Cooling technician application. Our team will check it within 2 working days and let you know here.\nمرحباً ${name}، استلمنا طلب انضمامك كفني. سيراجعه فريقنا خلال يومي عمل وسنبلغك هنا.`,
    approved: `Hello ${name}, your Ahmed Cooling technician application was approved. Log in to the technician app with your phone number and password.\nمرحباً ${name}، تمت الموافقة على طلبك. سجّل الدخول في تطبيق الفنيين برقم جوالك وكلمة المرور.`,
    rejected: `Hello ${name}, your Ahmed Cooling technician application was not approved: ${why}\nمرحباً ${name}، لم تتم الموافقة على طلبك: ${why}`,
    changes: `Hello ${name}, we need a change in your technician application: ${why}\nOpen the technician app, tap Login and update your application.\nمرحباً ${name}، نحتاج إلى تعديل في طلبك: ${why}\nافتح تطبيق الفنيين واضغط تسجيل الدخول ثم عدّل طلبك.`,
  }[decision];
  const label = { received: 'received | تم الاستلام', approved: 'approved | تمت الموافقة', rejected: 'not approved | لم تتم الموافقة', changes: 'sent back for changes | أُعيد لإجراء تعديلات' }[decision];
  return send(application.phone, APPLICATION_RESULT_TEMPLATE, [name, label, detail], text);
};

module.exports = { onTheWayToCustomer, completedToCustomer, offerToTechnician, lateToTechnician, assignedToCustomer, technicianChangedToCustomer, applicationDecision };
