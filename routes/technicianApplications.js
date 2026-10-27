// Public: a technician applies from the app. Mounted at /api/technician-applications (no login: the applicant has no
// account yet). The admin reviews the details and documents and approves, rejects, or sends the application back for
// changes (routes/adminApplications.js); the applicant then fixes it here (POST /mine/lookup + PUT /mine), proving who
// they are with the mobile number + password they chose when applying.
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const User = require('../models/User');
const TechnicianApplication = require('../models/TechnicianApplication');
const cloudinary = require('../utils/cloudinary');
const upload = require('../utils/multer');
const { notifyUser, pushToTokens } = require('../utils/notify');
const dispatchWhatsApp = require('../utils/dispatchWhatsApp');

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const { validateAnyPhone, normalizeAnyPhone, phoneVariants } = require('../utils/phone');
const { normEmail, isEmail, cleanStr } = require('../utils/security');

const CITIES = ['jeddah', 'makkah'];
const SPECIALTIES = ['ac', 'refrigerator', 'washing-machine', 'stove', 'general'];

const limiter = (limit, message, messageAr) => rateLimit({
  windowMs: 60 * 60 * 1000,
  limit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message, messageAr },
});
const applyLimiter = limiter(Number(process.env.TECH_APPLY_RATE_LIMIT || 6), 'Too many applications from this connection. Please try again later.', 'طلبات كثيرة من هذا الاتصال. حاول مرة أخرى لاحقاً.');
const mineLimiter = limiter(Number(process.env.TECH_APPLY_MINE_RATE_LIMIT || 30), 'Too many attempts. Please try again later.', 'محاولات كثيرة. حاول مرة أخرى لاحقاً.');

// Every message goes out in English and Arabic (the app shows messageAr to Arabic users).
const bad = (res, status, message, messageAr) => res.status(status).json({ success: false, message, messageAr });

const list = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed; } catch { /* comma separated */ }
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
};

const toCloudinary = (file, options) => new Promise((resolve, reject) => {
  cloudinary.uploader.upload_stream(options, (error, result) => (error ? reject(error) : resolve(result))).end(file.buffer);
});

const FILE_FIELDS = ['photo', 'idPhoto', 'idPhotoBack', 'passportPhoto', 'certificatePhoto'];
const uploadFiles = (req, res, next) => upload.fields(FILE_FIELDS.map((name) => ({ name, maxCount: 1 })))(req, res, (err) => (err
  ? bad(res, 400, 'Photos must be JPG, PNG or WebP, up to 5 MB each.', 'يجب أن تكون الصور بصيغة JPG أو PNG أو WebP وبحجم لا يتجاوز 5 ميغابايت.')
  : next()));
const fileOf = (req, name) => (req.files && req.files[name] && req.files[name][0]) || null;

// Validates the text fields. partial = false: every field is required (a new application). partial = true: only the
// fields that were sent are checked (an update after the admin asked for changes). Returns { error: [en, ar] } or { values }.
const parseFields = (body, { partial }) => {
  const has = (k) => !partial || body[k] !== undefined;
  const values = {};
  if (has('fullName')) {
    const fullName = cleanStr(body.fullName, 80);
    if (fullName.length < 3) return { error: ['Please enter your full name', 'الرجاء إدخال اسمك الكامل'] };
    values.fullName = fullName;
  }
  if (has('email')) {
    const email = body.email ? normEmail(body.email) : '';
    if (!email || !isEmail(email)) return { error: ['Enter a valid email address', 'أدخل بريداً إلكترونياً صحيحاً'] };
    values.email = email;
  }
  if (has('dateOfBirth')) {
    // YYYY-MM-DD, a real date, and an adult of working age
    const dobText = typeof body.dateOfBirth === 'string' ? body.dateOfBirth.trim() : '';
    const dateOfBirth = /^\d{4}-\d{2}-\d{2}$/.test(dobText) ? new Date(`${dobText}T00:00:00Z`) : null;
    if (!dateOfBirth || Number.isNaN(dateOfBirth.getTime()) || dateOfBirth.toISOString().slice(0, 10) !== dobText) {
      return { error: ['Enter your date of birth', 'أدخل تاريخ ميلادك'] };
    }
    const age = (Date.now() - dateOfBirth.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (age < 18 || age > 70) return { error: ['You must be between 18 and 70 years old to apply', 'يجب أن يكون عمرك بين 18 و70 سنة للتقديم'] };
    values.dateOfBirth = dateOfBirth;
  }
  if (has('cities')) {
    const cities = [...new Set(list(body.cities))];
    if (!cities.length || cities.some((c) => !CITIES.includes(c))) return { error: ['Choose Jeddah and/or Makkah', 'اختر جدة و/أو مكة'] };
    values.cities = cities;
  }
  if (has('skills')) {
    const skills = [...new Set(list(body.skills))];
    if (!skills.length || skills.some((s) => !SPECIALTIES.includes(s))) return { error: ['Choose at least one specialty', 'اختر تخصصاً واحداً على الأقل'] };
    values.skills = skills;
  }
  if (has('experienceYears')) {
    const years = Number(body.experienceYears);
    values.experienceYears = Number.isFinite(years) && years >= 0 && years <= 60 ? Math.round(years) : 0;
  }
  if (has('nationalId')) {
    const nationalId = cleanStr(body.nationalId, 30).replace(/\s+/g, '');
    if (!/^[A-Za-z0-9-]{6,30}$/.test(nationalId)) return { error: ['Enter your Iqama / ID number', 'أدخل رقم الإقامة / الهوية'] };
    values.nationalId = nationalId;
  }
  if (body.about !== undefined) values.about = cleanStr(body.about, 500);
  return { values };
};

const pushTokensFrom = (body) => {
  const pushToken = typeof body.pushToken === 'string' ? body.pushToken.trim() : '';
  return pushToken.length >= 20 && pushToken.length <= 4096
    ? [{ token: pushToken, kind: body.pushKind === 'expo' ? 'expo' : 'fcm', platform: ['android', 'ios'].includes(body.pushPlatform) ? body.pushPlatform : 'android' }]
    : [];
};

// ---------- a new application ----------

router.post('/', applyLimiter, uploadFiles, async (req, res) => {
  try {
    const body = req.body || {};
    const parsed = parseFields(body, { partial: false });
    if (parsed.error) return bad(res, 400, parsed.error[0], parsed.error[1]);

    const phoneCheck = validateAnyPhone(body.phone);
    if (!phoneCheck.valid) return bad(res, 400, phoneCheck.msg || 'Enter a valid mobile number', 'أدخل رقم جوال صحيحاً');
    const phone = normalizeAnyPhone(body.phone);

    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < 8 || password.length > 72) return bad(res, 400, 'Password must be 8 to 72 characters', 'يجب أن تتكون كلمة المرور من 8 إلى 72 حرفاً');

    const photoFile = fileOf(req, 'photo');
    const idFile = fileOf(req, 'idPhoto');
    const idBackFile = fileOf(req, 'idPhotoBack');
    const passportFile = fileOf(req, 'passportPhoto');
    const certificateFile = fileOf(req, 'certificatePhoto');
    if (!photoFile) return bad(res, 400, 'Add your personal photo', 'أضف صورتك الشخصية');
    if (!idFile) return bad(res, 400, 'Add a photo of your Iqama / ID', 'أضف صورة الإقامة / الهوية');
    if (!passportFile) return bad(res, 400, 'Add a photo of your passport', 'أضف صورة جواز السفر');
    if (!certificateFile) return bad(res, 400, 'Add a photo of your certificate', 'أضف صورة الشهادة');

    // Same number already working for us, or already waiting for review / for the applicant's changes
    if (await User.findOne({ phone: { $in: phoneVariants(phone) }, role: { $in: ['technician', 'admin'] } }).select('_id').lean()) {
      return bad(res, 409, 'This number already has a technician account. Please log in.', 'هذا الرقم لديه حساب فني بالفعل. الرجاء تسجيل الدخول.');
    }
    if (await TechnicianApplication.findOne({ phone: { $in: phoneVariants(phone) }, status: { $in: ['pending', 'changes_requested'] } }).select('_id').lean()) {
      return bad(res, 409, 'An application with this number is already under review.', 'يوجد طلب بهذا الرقم قيد المراجعة بالفعل.');
    }

    const stamp = Date.now();
    const [photo, idPhoto, idPhotoBack, passport, certificate] = await Promise.all([
      toCloudinary(photoFile, {
        folder: 'ahmedcooling/technician-applications', public_id: `photo-${stamp}`, format: 'jpg',
        transformation: [{ width: 640, height: 640, crop: 'fill', gravity: 'face' }],
      }),
      toCloudinary(idFile, { folder: 'ahmedcooling/technician-ids', public_id: `id-${stamp}`, type: 'authenticated', format: 'jpg' }),
      idBackFile
        ? toCloudinary(idBackFile, { folder: 'ahmedcooling/technician-ids', public_id: `id-back-${stamp}`, type: 'authenticated', format: 'jpg' })
        : Promise.resolve(null),
      toCloudinary(passportFile, { folder: 'ahmedcooling/technician-ids', public_id: `passport-${stamp}`, type: 'authenticated', format: 'jpg' }),
      toCloudinary(certificateFile, { folder: 'ahmedcooling/technician-ids', public_id: `certificate-${stamp}`, type: 'authenticated', format: 'jpg' }),
    ]);

    const statusKey = crypto.randomBytes(24).toString('hex');
    const application = await TechnicianApplication.create({
      ...parsed.values, about: parsed.values.about || '', phone, passwordHash: await bcrypt.hash(password, 10), statusKeyHash: sha256(statusKey),
      idPhotoPublicId: idPhoto.public_id, idPhotoBackPublicId: idPhotoBack ? idPhotoBack.public_id : '',
      passportPublicId: passport.public_id, certificatePublicId: certificate.public_id,
      photoUrl: photo.secure_url, pushTokens: pushTokensFrom(body),
    });
    res.status(201).json({
      success: true,
      message: 'Application received. Your verification will be completed within 2 working days.',
      messageAr: 'تم استلام طلبك. سيتم التحقق منك خلال يومي عمل.',
      applicationId: String(application._id),
      statusKey,
    });

    // The applicant hears that it arrived (push on this phone + WhatsApp), the admins that there is one to review
    pushToTokens(application.pushTokens, {
      title: 'Application received | تم استلام طلبك',
      message: 'Our team will check your details within 2 working days.\nسيراجع فريقنا بياناتك خلال يومي عمل.',
      data: { kind: 'application', status: 'received' },
    }).catch(() => {});
    dispatchWhatsApp.applicationDecision(application, 'received').catch(() => {});
    User.find({ role: 'admin' }).select('_id').lean().then((admins) => Promise.all(admins.map((admin) => notifyUser(admin._id, {
      type: 'system', priority: 'high', title: 'New technician application',
      message: `${application.fullName} applied to join as a technician. Please review the application.`,
      data: { kind: 'application', applicationId: String(application._id) },
    })))).catch(() => {});
  } catch (err) {
    console.error('Technician application error:', err.message);
    bad(res, 500, 'Could not send your application. Please try again.', 'تعذر إرسال طلبك. حاول مرة أخرى.');
  }
});

// ---------- where my application stands (the phone that sent it, with the key it got back) ----------

router.get('/:id/status', mineLimiter, async (req, res) => {
  try {
    const key = typeof req.query.key === 'string' ? req.query.key : '';
    if (!/^[a-f\d]{24}$/i.test(req.params.id) || !/^[a-f\d]{48}$/i.test(key)) return bad(res, 404, 'Application not found', 'الطلب غير موجود');
    const a = await TechnicianApplication.findById(req.params.id).select('+statusKeyHash status adminMessage rejectionReason reviewedAt');
    if (!a || !a.statusKeyHash || a.statusKeyHash !== sha256(key)) return bad(res, 404, 'Application not found', 'الطلب غير موجود');
    res.json({
      success: true, status: a.status, adminMessage: a.adminMessage || '', rejectionReason: a.rejectionReason || '', reviewedAt: a.reviewedAt || null,
    });
  } catch (err) {
    console.error('Technician application status error:', err.message);
    bad(res, 500, 'Could not check your application. Please try again.', 'تعذر التحقق من طلبك. حاول مرة أخرى.');
  }
});

// ---------- fixing an application the admin sent back ----------

// The applicant's own application (mobile number + the password they chose), only while it is waiting for their changes.
const findSentBack = async (body) => {
  const phone = typeof body.phone === 'string' ? body.phone : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!phone || !password || password.length > 200) return null;
  const candidates = await TechnicianApplication.find({ phone: { $in: phoneVariants(normalizeAnyPhone(phone)) }, status: 'changes_requested' })
    .select('+passwordHash').sort({ createdAt: -1 }).limit(3);
  for (const application of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await bcrypt.compare(password, application.passwordHash)) return application;
  }
  return null;
};

// What the form needs to be filled in again: the text fields, and which documents are already on file (never the
// documents themselves — the ID photos stay private to the admin).
router.post('/mine/lookup', mineLimiter, async (req, res) => {
  try {
    const a = await findSentBack(req.body || {});
    if (!a) return bad(res, 404, 'No application is waiting for your changes.', 'لا يوجد طلب بانتظار تعديلاتك.');
    res.json({
      success: true,
      application: {
        fullName: a.fullName, phone: a.phone, email: a.email, dateOfBirth: a.dateOfBirth, cities: a.cities, skills: a.skills,
        experienceYears: a.experienceYears, about: a.about, nationalId: a.nationalId, photoUrl: a.photoUrl,
        adminMessage: a.adminMessage || '',
        has: { photo: !!a.photoUrl, idPhoto: !!a.idPhotoPublicId, idPhotoBack: !!a.idPhotoBackPublicId, passportPhoto: !!a.passportPublicId, certificatePhoto: !!a.certificatePublicId },
      },
    });
  } catch (err) {
    console.error('Technician application lookup error:', err.message);
    bad(res, 500, 'Could not load your application. Please try again.', 'تعذر تحميل طلبك. حاول مرة أخرى.');
  }
});

// Sends the corrected application back to the admin. Any text field and any document may be replaced; what is not
// sent stays as it was. The phone number and password cannot change here (they identify the applicant).
router.put('/mine', mineLimiter, uploadFiles, async (req, res) => {
  try {
    const body = req.body || {};
    const a = await findSentBack(body);
    if (!a) return bad(res, 404, 'No application is waiting for your changes.', 'لا يوجد طلب بانتظار تعديلاتك.');
    const parsed = parseFields(body, { partial: true });
    if (parsed.error) return bad(res, 400, parsed.error[0], parsed.error[1]);

    const stamp = Date.now();
    const oldAssets = [];
    const set = { ...parsed.values, status: 'pending', resubmittedAt: new Date() };

    const photoFile = fileOf(req, 'photo');
    if (photoFile) {
      const photo = await toCloudinary(photoFile, {
        folder: 'ahmedcooling/technician-applications', public_id: `photo-${stamp}`, format: 'jpg',
        transformation: [{ width: 640, height: 640, crop: 'fill', gravity: 'face' }],
      });
      set.photoUrl = photo.secure_url;
    }
    const privateDocs = [['idPhoto', 'idPhotoPublicId', 'id'], ['idPhotoBack', 'idPhotoBackPublicId', 'id-back'], ['passportPhoto', 'passportPublicId', 'passport'], ['certificatePhoto', 'certificatePublicId', 'certificate']];
    for (const [field, key, label] of privateDocs) {
      const file = fileOf(req, field);
      if (!file) continue;
      // eslint-disable-next-line no-await-in-loop
      const uploaded = await toCloudinary(file, { folder: 'ahmedcooling/technician-ids', public_id: `${label}-${stamp}`, type: 'authenticated', format: 'jpg' });
      if (a[key]) oldAssets.push(a[key]);
      set[key] = uploaded.public_id;
    }
    const pushTokens = pushTokensFrom(body);
    if (pushTokens.length) set.pushTokens = pushTokens;

    await TechnicianApplication.updateOne({ _id: a._id, status: 'changes_requested' }, { $set: set });
    for (const publicId of oldAssets) {
      cloudinary.uploader.destroy(publicId, { type: 'authenticated', invalidate: true }).catch(() => {});
    }

    // Tell the admins it is ready to look at again
    User.find({ role: 'admin' }).select('_id').lean().then((admins) => Promise.all(admins.map((admin) => notifyUser(admin._id, {
      type: 'system', priority: 'high', title: 'Technician application updated',
      message: `${set.fullName || a.fullName} sent the changes you asked for. Please review the application again.`,
      data: { kind: 'application', applicationId: String(a._id) },
    })))).catch(() => {});

    res.json({
      success: true,
      message: 'Thank you! Your updated application was received. Your verification will be completed within 2 working days.',
      messageAr: 'شكراً لك! تم استلام طلبك المحدّث. سيتم التحقق منك خلال يومي عمل.',
    });
  } catch (err) {
    console.error('Technician application update error:', err.message);
    bad(res, 500, 'Could not send your changes. Please try again.', 'تعذر إرسال تعديلاتك. حاول مرة أخرى.');
  }
});

module.exports = router;
