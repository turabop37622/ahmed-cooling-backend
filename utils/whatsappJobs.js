// Job requests on WhatsApp ("I need a job", "kaam chahiye", "أبحث عن وظيفة"). Step by step, like the owner asked:
//   1. the bot asks for a photo of the Iqama (front)
//   2. the photo is stored privately and the admin is told; the admin checks it in the admin panel (Job requests)
//   3. the admin taps "Ask for details": the bot asks for name -> work type -> city -> years of experience
//   4. the admin is told the details are in; the account itself comes from the technician application in the app
// The lead lives in models/JobLead.js; admin actions are routes/adminJobLeads.js.
const axios = require('axios');
const JobLead = require('../models/JobLead');
const cloudinary = require('./cloudinary');
const { escapeHtml } = require('./security');
const { sendTextMessage, sendButtonsMessage, sendListMessage } = require('./whatsappCloud');
const { logMessage } = require('./whatsappConversationStore');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const SENDER_EMAIL = process.env.EMAIL_FROM || ADMIN_EMAIL;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

// "job", "vacancy", "naukri", "kaam chahiye", "وظيفة", "توظيف", "أبحث عن عمل"... A customer's "I need a technician" is
// not a job request, so plain "technician"/"work" alone do not count.
const JOB_RE = /\b(job|jobs|vacanc(y|ies)|hiring|recruit\w*|employment|naukri|naukari|rozgar)\b|\b(need|want|looking for|apply for|any)\s+(a\s+)?(job|work)\b|\bkaam\s*(chahiye|chahie|chaiye|chai|dein|do|milega)\b|\b(technician|helper|worker)\s+(job|vacancy|post)\b|\bwork\s+with\s+you\b|وظيف|توظيف|ابحث\s*عن\s*عمل|أبحث\s*عن\s*عمل|ابغى\s*(شغل|عمل|وظيفه|وظيفة)|ابي\s*(شغل|عمل|وظيفه|وظيفة)|تشغيل\s*فني|تحتاجون\s*فني|محتاجين\s*فني/i;
const isJobRequest = (text) => JOB_RE.test(String(text || ''));

const OPEN = ['awaiting_iqama', 'iqama_review', 'awaiting_details'];
const L = (isAr, en, ar) => (isAr ? ar : en);
const isArLead = (lead) => lead && lead.language === 'ar';

const say = async (phone, text) => {
  await sendTextMessage(phone, text);
  await logMessage(phone, 'out', text, { messageType: 'text', sentBy: 'bot' });
};

const emailAdmin = async (subject, html) => {
  if (!BREVO_API_KEY || !ADMIN_EMAIL) return;
  try {
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: 'Ahmed Cooling - WhatsApp Bot', email: SENDER_EMAIL },
      to: [{ email: ADMIN_EMAIL }],
      subject,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">${html}<p>Open the admin panel: <strong>Technician applications → WhatsApp job requests</strong>.</p></div>`,
    }, { headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 });
  } catch (err) {
    console.error('❌ Job-request admin email failed:', err.response?.data || err.message);
  }
};

const openLead = (phone) => JobLead.findOne({ phone, status: { $in: OPEN } }).sort({ updatedAt: -1 });

// A job request: ask for the Iqama (or, if one is already being handled, say where it stands).
const start = async (phone, { isAr, customerName } = {}) => {
  const existing = await openLead(phone);
  if (existing && existing.status === 'iqama_review') {
    await say(phone, L(isArLead(existing),
      'Thanks! We already have your Iqama and our team is checking it. We will message you here soon 🙏',
      'شكراً لك! استلمنا إقامتك وفريقنا يراجعها الآن، وسنراسلك هنا قريباً 🙏'));
    return;
  }
  if (existing && existing.status === 'awaiting_details') { await askStep(phone, existing); return; }
  if (!existing) {
    await JobLead.create({ phone, whatsappName: customerName || '', language: isAr ? 'ar' : 'en', status: 'awaiting_iqama' });
  }
  await say(phone, L(isAr,
    'Thank you for your interest in working with Ahmed Cooling Workshop! 👷\n\nTo start, please send a clear photo of your Iqama (front side) here. Our team will check it and then ask you for a few more details.',
    'شكراً لاهتمامك بالعمل مع ورشة أحمد للتبريد! 👷\n\nللبدء، أرسل هنا صورة واضحة لإقامتك (الوجه الأمامي). سيراجعها فريقنا ثم نطلب منك بعض التفاصيل.'));
};

const toPrivateCloudinary = (buffer, publicId) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    { folder: 'ahmedcooling/job-leads', public_id: publicId, type: 'authenticated', format: 'jpg', resource_type: 'image' },
    (err, result) => (err ? reject(err) : resolve(result))
  );
  stream.end(buffer);
});

// A photo while we wait for the Iqama: store it privately and hand the lead to the admin. Returns true if it was.
const handleImage = async (phone, message) => {
  const lead = await JobLead.findOne({ phone, status: 'awaiting_iqama' }).sort({ updatedAt: -1 });
  if (!lead) return false;
  const media = require('./whatsappMedia');
  const isAr = isArLead(lead);
  const mediaId = message.image && message.image.id;
  if (!mediaId || !media.cloudinaryReady()) return false;
  try {
    const { buffer } = await media.downloadMedia(mediaId);
    const uploaded = await toPrivateCloudinary(buffer, `iqama-${lead._id}-${Date.now()}`);
    lead.iqamaPublicId = uploaded.public_id;
    lead.iqamaReceivedAt = new Date();
    lead.status = 'iqama_review';
    await lead.save();
  } catch (err) {
    console.error('❌ Job-request Iqama upload failed:', err.response?.data?.error?.message || err.message);
    await say(phone, L(isAr, 'Sorry, I could not save that photo. Please send it again.', 'عذراً، تعذر حفظ الصورة. أرسلها مرة أخرى من فضلك.'));
    return true;
  }
  await say(phone, L(isAr,
    'Thank you! We received your Iqama ✅ Our team will check it and message you here with the next step.',
    'شكراً لك! استلمنا صورة الإقامة ✅ سيراجعها فريقنا ونراسلك هنا بالخطوة التالية.'));
  await emailAdmin(`👷 WhatsApp job request: Iqama received (${phone})`,
    `<h2 style="color:#2563EB;">New job request on WhatsApp</h2><p><strong>Phone:</strong> ${escapeHtml(phone)}</p>${lead.whatsappName ? `<p><strong>WhatsApp name:</strong> ${escapeHtml(lead.whatsappName)}</p>` : ''}<p>They sent their Iqama photo. Check it, then tap <strong>Ask for details</strong> or <strong>Not suitable</strong>.</p>`);
  return true;
};

// ---------- the details, one question at a time ----------
const SKILL_ROWS = [
  ['ac', 'AC / cooling', 'مكيفات وتبريد'],
  ['refrigerator', 'Fridge / freezer', 'ثلاجات وفريزر'],
  ['washing-machine', 'Washing machine', 'غسالات'],
  ['stove', 'Stove / oven / microwave', 'أفران وميكروويف'],
  ['general', 'Electrical / general', 'كهرباء وصيانة عامة'],
];
const ORDER = ['name', 'skills', 'city', 'experience'];

const askStep = async (phone, lead) => {
  const isAr = isArLead(lead);
  if (lead.detailsStep === 'name') {
    await say(phone, L(isAr, 'Please write your full name (as on your Iqama).', 'اكتب اسمك الكامل (كما في الإقامة).'));
  } else if (lead.detailsStep === 'skills') {
    const body = L(isAr, 'What work do you do? Choose your main skill (you can write more than one, e.g. "AC and fridge").', 'ما نوع العمل الذي تجيده؟ اختر تخصصك الأساسي (ويمكنك كتابة أكثر من واحد، مثل «مكيفات وثلاجات»).');
    const rows = SKILL_ROWS.map(([id, en, ar]) => ({ id: `job_skill_${id}`, title: L(isAr, en, ar).slice(0, 24) }));
    try { await sendListMessage(phone, body, L(isAr, 'Choose skill', 'اختر التخصص'), [{ rows }]); } catch { await sendTextMessage(phone, body); }
    await logMessage(phone, 'out', `${body} [list: ${rows.map((r) => r.title).join(', ')}]`, { messageType: 'button', sentBy: 'bot' });
  } else if (lead.detailsStep === 'city') {
    const body = L(isAr, 'Which city can you work in?', 'في أي مدينة تستطيع العمل؟');
    const buttons = [
      { id: 'job_city_jeddah', title: L(isAr, 'Jeddah', 'جدة') },
      { id: 'job_city_makkah', title: L(isAr, 'Makkah', 'مكة') },
      { id: 'job_city_both', title: L(isAr, 'Both', 'الاثنتين') },
    ];
    try { await sendButtonsMessage(phone, body, buttons); } catch { await sendTextMessage(phone, body); }
    await logMessage(phone, 'out', `${body} [${buttons.map((b) => b.title).join(' / ')}]`, { messageType: 'button', sentBy: 'bot' });
  } else if (lead.detailsStep === 'experience') {
    await say(phone, L(isAr, 'How many years of experience do you have? (just the number, e.g. 5)', 'كم سنة خبرة لديك؟ (اكتب الرقم فقط، مثل 5)'));
  }
};

const SKILL_WORDS = [
  ['ac', /\bac\b|a\/c|air\s*con|split|cool|مكيف|تكييف|تبريد|سبليت/i],
  ['refrigerator', /fridge|refrigerat|freez|ثلاج|فريزر|براد/i],
  ['washing-machine', /wash|غسال/i],
  ['stove', /stove|oven|cooker|microwave|فرن|موقد|طباخ|ميكروويف/i],
  ['general', /electric|wiring|general|plumb|كهرب|صيانه\s*عامه|صيانة\s*عامة|سباك/i],
];
const asciiDigits = (s) => String(s).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

// Text or a tap while the bot is collecting the details (or waiting for the Iqama). Returns true if it was consumed.
const handleReply = async (phone, input) => {
  const lead = await openLead(phone);
  if (!lead) return false;
  const isAr = isArLead(lead);
  const raw = String(input || '').trim();
  if (/^(cancel|stop|الغاء|إلغاء|rehne do|nahi chahiye)$/i.test(raw)) {
    lead.status = 'cancelled';
    await lead.save();
    await say(phone, L(isAr, 'Okay, your job request is cancelled. You can message us again any time.', 'تم إلغاء طلب العمل. يمكنك مراسلتنا مرة أخرى في أي وقت.'));
    return true;
  }
  if (lead.status === 'awaiting_iqama') {
    // Another job message: remind them of the photo; anything else is a normal chat
    if (isJobRequest(raw) || /iqama|اقامه|إقامة|اقامة/i.test(raw)) {
      await say(phone, L(isAr, 'Please send a photo of your Iqama (front side) here 📷', 'أرسل هنا صورة الإقامة (الوجه الأمامي) من فضلك 📷'));
      return true;
    }
    return false;
  }
  if (lead.status === 'iqama_review') {
    if (isJobRequest(raw)) { await start(phone, { isAr }); return true; }
    return false;
  }
  if (lead.status !== 'awaiting_details') return false;

  const step = lead.detailsStep || 'name';
  if (step === 'name') {
    const name = raw.replace(/\s+/g, ' ');
    if (name.length < 3 || name.length > 80 || /\d/.test(name) || /^(job_|menu_|svc_|cat_)/.test(name)) {
      await say(phone, L(isAr, 'Please write your full name, e.g. "Mohammed Ahmed".', 'اكتب اسمك الكامل، مثل «محمد أحمد».'));
      return true;
    }
    lead.fullName = name;
  } else if (step === 'skills') {
    const tapped = /^job_skill_(.+)$/.exec(raw);
    const skills = tapped ? [tapped[1]] : SKILL_WORDS.filter(([, re]) => re.test(raw)).map(([k]) => k);
    if (!skills.length) { await askStep(phone, lead); return true; }
    lead.skills = [...new Set(skills)];
  } else if (step === 'city') {
    const t = raw.toLowerCase();
    const cities = t === 'job_city_both' || /both|dono|الاثنتين|كلاهما|الاثنين/.test(t) ? ['jeddah', 'makkah']
      : t === 'job_city_jeddah' || /jedd|jidd|jeda|جده|جدة/.test(t) ? ['jeddah']
        : t === 'job_city_makkah' || /makk|mekk|mecca|مكه|مكة/.test(t) ? ['makkah'] : [];
    if (!cities.length) { await askStep(phone, lead); return true; }
    lead.cities = cities;
  } else if (step === 'experience') {
    const m = /(\d{1,2})/.exec(asciiDigits(raw));
    if (!m) { await askStep(phone, lead); return true; }
    lead.experienceYears = Math.min(60, Number(m[1]));
  }

  const next = ORDER[ORDER.indexOf(step) + 1];
  if (next) {
    lead.detailsStep = next;
    await lead.save();
    await askStep(phone, lead);
    return true;
  }
  lead.detailsStep = '';
  lead.status = 'details_received';
  lead.detailsReceivedAt = new Date();
  await lead.save();
  await say(phone, L(isAr,
    'Thank you, we have all your details ✅ Our team will contact you soon.\n\nTo finish, you can also apply in the Ahmed Cooling app: open it and tap "I am a technician".',
    'شكراً لك، وصلتنا كل بياناتك ✅ سيتواصل معك فريقنا قريباً.\n\nلإكمال الطلب يمكنك أيضاً التقديم من تطبيق أحمد للتبريد: افتحه واضغط «أنا فني».'));
  await emailAdmin(`👷 WhatsApp job request: details received (${lead.fullName})`,
    `<h2 style="color:#16A34A;">Job request details received</h2><p><strong>Name:</strong> ${escapeHtml(lead.fullName)}</p><p><strong>Phone:</strong> ${escapeHtml(phone)}</p><p><strong>Skills:</strong> ${escapeHtml(lead.skills.join(', '))}</p><p><strong>City:</strong> ${escapeHtml(lead.cities.join(', '))}</p><p><strong>Experience:</strong> ${lead.experienceYears} years</p>`);
  return true;
};

// ---------- admin actions (routes/adminJobLeads.js) ----------
// Iqama is fine: ask for the details. Fails if WhatsApp no longer lets us write to them (24 h after their last message).
const askForDetails = async (lead) => {
  const isAr = isArLead(lead);
  const intro = L(isAr,
    'Good news! We checked your Iqama ✅ Now please share a few details with us, one at a time.',
    'خبر جيد! راجعنا إقامتك ✅ الآن شاركنا بعض التفاصيل، سؤالاً بسؤال.');
  await sendTextMessage(lead.phone, intro); // throws if the 24 h window is closed: nothing is changed then
  await logMessage(lead.phone, 'out', intro, { messageType: 'text', sentBy: 'bot' });
  lead.status = 'awaiting_details';
  lead.detailsStep = 'name';
  await lead.save();
  await askStep(lead.phone, lead);
};

const rejectLead = async (lead, reason) => {
  const isAr = isArLead(lead);
  lead.status = 'rejected';
  lead.rejectionReason = String(reason || '').slice(0, 300);
  await lead.save();
  const text = L(isAr,
    `Thank you for your interest in Ahmed Cooling Workshop. Unfortunately we cannot continue your job request${lead.rejectionReason ? `: ${lead.rejectionReason}` : '.'}`,
    `شكراً لاهتمامك بورشة أحمد للتبريد. للأسف لا يمكننا متابعة طلب العمل${lead.rejectionReason ? `: ${lead.rejectionReason}` : '.'}`);
  try {
    await sendTextMessage(lead.phone, text);
    await logMessage(lead.phone, 'out', text, { messageType: 'text', sentBy: 'admin' });
    return { messaged: true };
  } catch {
    return { messaged: false };
  }
};

module.exports = { isJobRequest, start, handleImage, handleReply, askForDetails, rejectLead, JOB_RE };
