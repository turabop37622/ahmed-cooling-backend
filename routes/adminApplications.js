// Admin panel: technician applications from the app. Mounted inside routes/admin.js after adminAuth (admin-only).
// Approving creates the real technician account (User + Technician profile) with the password the applicant chose.
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const User = require('../models/User');
const Technician = require('../models/Technician');
const TechnicianApplication = require('../models/TechnicianApplication');
const AuditLog = require('../models/AuditLog');
const cloudinary = require('../utils/cloudinary');
const { phoneVariants } = require('../utils/phone');
const dispatchWhatsApp = require('../utils/dispatchWhatsApp');
const { notifyUser, pushToTokens } = require('../utils/notify');

const isObjectId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);
const serverError = (res) => res.status(500).json({ success: false, message: 'Server error' });
const STATUSES = ['pending', 'changes_requested', 'approved', 'rejected'];

// A signed link to the private ID photo (only the admin panel ever gets one).
const idPhotoUrl = (publicId) => cloudinary.url(publicId, { type: 'authenticated', sign_url: true, secure: true, resource_type: 'image', format: 'jpg' });

// Tells the applicant the decision: push to the device they applied from, an in-app notification (waiting for them in
// the technician app after their first login, when approved) and a WhatsApp message.
const tellApplicant = async (application, decision, userId) => {
  const approved = decision === 'approved';
  const TEXT = {
    approved: [
      'Application approved', 'تمت الموافقة على طلبك',
      'Welcome to Ahmed Cooling! Log in to the technician app with your mobile number and password.', 'مرحباً بك في أحمد للتبريد! سجّل الدخول إلى تطبيق الفنيين برقم جوالك وكلمة المرور.',
    ],
    rejected: [
      'Application not approved', 'لم تتم الموافقة على طلبك',
      `Your technician application was not approved: ${application.rejectionReason}`, `لم تتم الموافقة على طلبك: ${application.rejectionReason}`,
    ],
    changes: [
      'Please update your application', 'يرجى تحديث طلبك',
      `We need a change: ${application.adminMessage} Open the technician app, tap Login and update your application.`, `نحتاج إلى تعديل: ${application.adminMessage} افتح تطبيق الفنيين واضغط تسجيل الدخول ثم عدّل طلبك.`,
    ],
  };
  const [title, titleAr, message, messageAr] = TEXT[decision];
  const data = { kind: 'application', status: decision, titleAr, messageAr };
  await Promise.all([
    pushToTokens(application.pushTokens, { title: `${title} | ${titleAr}`, message: `${message}\n${messageAr}`, data }),
    approved && userId ? notifyUser(userId, { type: 'system', title, titleAr, message, messageAr, data, priority: 'high' }) : null,
    dispatchWhatsApp.applicationDecision(application, decision),
  ].filter(Boolean).map((p) => Promise.resolve(p).catch(() => {})));
};

const shape = (a, { withId = false } = {}) => ({
  _id: a._id, fullName: a.fullName, phone: a.phone, email: a.email || '', cities: a.cities, skills: a.skills,
  experienceYears: a.experienceYears, about: a.about, nationalId: a.nationalId, dateOfBirth: a.dateOfBirth, photoUrl: a.photoUrl,
  status: a.status, rejectionReason: a.rejectionReason || '', adminMessage: a.adminMessage || '', resubmittedAt: a.resubmittedAt || null, reviewedAt: a.reviewedAt || null, user: a.user || null, createdAt: a.createdAt,
  ...(withId ? { idPhotoUrl: idPhotoUrl(a.idPhotoPublicId), idPhotoBackUrl: a.idPhotoBackPublicId ? idPhotoUrl(a.idPhotoBackPublicId) : '',
    passportUrl: a.passportPublicId ? idPhotoUrl(a.passportPublicId) : '', certificateUrl: a.certificatePublicId ? idPhotoUrl(a.certificatePublicId) : '' } : {}),
});

router.get('/technician-applications', async (req, res) => {
  try {
    const filter = {};
    if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
    const rows = await TechnicianApplication.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    const pending = await TechnicianApplication.countDocuments({ status: 'pending' });
    res.json({ success: true, pending, applications: rows.map((a) => shape(a)) });
  } catch (err) {
    console.error('Admin applications list error:', err.message);
    serverError(res);
  }
});

router.get('/technician-applications/:id', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Application not found' });
    const a = await TechnicianApplication.findById(req.params.id).lean();
    if (!a) return res.status(404).json({ success: false, message: 'Application not found' });
    res.json({ success: true, application: shape(a, { withId: true }) });
  } catch (err) {
    serverError(res);
  }
});

// What the admin sees when an application is no longer waiting for a decision.
const ALREADY_DECIDED = {
  approved: 'This application was already approved',
  rejected: 'This application was already rejected',
  changes_requested: 'This application was sent back to the applicant for changes. Wait for them to resubmit it.',
};

// Optional body: { cities, specialties, autoAssign } — the admin can correct what the applicant chose before approving.
router.post('/technician-applications/:id/approve', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Application not found' });
    const a = await TechnicianApplication.findById(req.params.id).select('+passwordHash');
    if (!a) return res.status(404).json({ success: false, message: 'Application not found' });
    if (a.status !== 'pending') return res.status(409).json({ success: false, message: ALREADY_DECIDED[a.status] || 'This application was already decided' });

    if (await User.findOne({ phone: { $in: phoneVariants(a.phone) }, role: { $in: ['technician', 'admin'] } }).select('_id').lean()) {
      return res.status(409).json({ success: false, message: 'A technician or admin already uses this phone number' });
    }
    if (a.email && await User.findOne({ email: a.email }).select('_id').lean()) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists — remove the email from the application first' });
    }

    const pickList = (value, allowed, fallback) => (Array.isArray(value) && value.length && value.every((v) => allowed.includes(v)) ? [...new Set(value)] : fallback);
    const cities = pickList(req.body && req.body.cities, ['jeddah', 'makkah'], a.cities);
    const skills = pickList(req.body && req.body.specialties, ['ac', 'refrigerator', 'washing-machine', 'stove', 'general'], a.skills);

    // The schema hashes `password` on save; the applicant's own bcrypt hash is written over it right after.
    const user = new User({
      fullName: a.fullName, phone: a.phone, ...(a.email ? { email: a.email } : {}), password: crypto.randomBytes(24).toString('hex'),
      role: 'technician', authProvider: 'phone', isVerified: true, isPhoneVerified: true, profileImage: a.photoUrl,
    });
    await user.save();
    await User.collection.updateOne({ _id: user._id }, { $set: { password: a.passwordHash } });
    try {
      await Technician.create({
        user: user._id, cities, skills, autoAssign: req.body && req.body.autoAssign === false ? false : true,
        active: true, availability: true, experience: `${a.experienceYears} years`,
      });
    } catch (e) {
      await User.deleteOne({ _id: user._id }).catch(() => {});
      throw e;
    }

    a.status = 'approved';
    a.user = user._id;
    a.reviewedBy = req.user.id;
    a.reviewedAt = new Date();
    await a.save();
    await AuditLog.record({ actor: req.user.id, action: 'technician.application_approve', target: { kind: 'technician', id: String(user._id), label: a.fullName } });
    tellApplicant(a, 'approved', user._id).catch(() => {});
    res.json({ success: true, message: 'Approved — the technician can now log in', userId: String(user._id) });
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ success: false, message: 'An account with this phone number or email already exists' });
    console.error('Admin application approve error:', err.message);
    serverError(res);
  }
});

// The documents or details are not right: send the application back with a message. The applicant is told on the phone
// and on WhatsApp, and fixes it from the app (login screen), after which it is pending again.
router.post('/technician-applications/:id/request-changes', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Application not found' });
    const message = String((req.body && req.body.message) || '').trim().slice(0, 500);
    if (message.length < 3) return res.status(400).json({ success: false, message: 'Write what the applicant needs to fix' });
    const a = await TechnicianApplication.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      { $set: { status: 'changes_requested', adminMessage: message, changesRequestedAt: new Date(), reviewedBy: req.user.id, reviewedAt: new Date() } },
      { new: true }
    );
    if (!a) return res.status(409).json({ success: false, message: 'Only an application that is waiting for review can be sent back' });
    await AuditLog.record({ actor: req.user.id, action: 'technician.application_request_changes', target: { kind: 'technician', id: String(a._id), label: a.fullName }, after: { message } });
    tellApplicant(a, 'changes').catch(() => {});
    res.json({ success: true, message: 'Sent back to the applicant' });
  } catch (err) {
    console.error('Admin application request-changes error:', err.message);
    serverError(res);
  }
});

router.post('/technician-applications/:id/reject', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Application not found' });
    const reason = String((req.body && req.body.reason) || '').trim().slice(0, 500);
    if (reason.length < 3) return res.status(400).json({ success: false, message: 'Write the reason so the applicant knows why' });
    const a = await TechnicianApplication.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ['pending', 'changes_requested'] } },
      { $set: { status: 'rejected', rejectionReason: reason, reviewedBy: req.user.id, reviewedAt: new Date() } },
      { new: true }
    );
    if (!a) return res.status(409).json({ success: false, message: 'This application was already decided' });
    // The ID document is not kept for people who were not accepted.
    for (const publicId of [a.idPhotoPublicId, a.idPhotoBackPublicId, a.passportPublicId, a.certificatePublicId].filter(Boolean)) {
      try { await cloudinary.uploader.destroy(publicId, { type: 'authenticated', invalidate: true }); } catch (e) { console.warn('ID photo cleanup failed:', e.message); }
    }
    await AuditLog.record({ actor: req.user.id, action: 'technician.application_reject', target: { kind: 'technician', id: String(a._id), label: a.fullName }, after: { reason } });
    tellApplicant(a, 'rejected').catch(() => {});
    res.json({ success: true, message: 'Application rejected' });
  } catch (err) {
    console.error('Admin application reject error:', err.message);
    serverError(res);
  }
});

module.exports = router;
