// Public: a technician applies from the app. Mounted at /api/technician-applications (no login: the applicant has no
// account yet). The admin reviews the details and documents and approves or rejects (routes/adminApplications.js).
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const User = require('../models/User');
const TechnicianApplication = require('../models/TechnicianApplication');
const cloudinary = require('../utils/cloudinary');
const upload = require('../utils/multer');
const { validateAnyPhone, normalizeAnyPhone, phoneVariants } = require('../utils/phone');
const { normEmail, isEmail, cleanStr } = require('../utils/security');

const CITIES = ['jeddah', 'makkah'];
const SPECIALTIES = ['ac', 'refrigerator', 'washing-machine', 'stove', 'general'];

const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.TECH_APPLY_RATE_LIMIT || 6),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many applications from this connection. Please try again later.' },
});

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

router.post(
  '/',
  applyLimiter,
  upload.fields([
    { name: 'photo', maxCount: 1 }, { name: 'idPhoto', maxCount: 1 }, { name: 'idPhotoBack', maxCount: 1 },
    { name: 'passportPhoto', maxCount: 1 }, { name: 'certificatePhoto', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const body = req.body || {};
      const fullName = cleanStr(body.fullName, 80);
      if (fullName.length < 3) return res.status(400).json({ success: false, message: 'Please enter your full name' });

      const phoneCheck = validateAnyPhone(body.phone);
      if (!phoneCheck.valid) return res.status(400).json({ success: false, message: phoneCheck.msg || 'Enter a valid mobile number' });
      const phone = normalizeAnyPhone(body.phone);

      const email = body.email ? normEmail(body.email) : '';
      if (!email || !isEmail(email)) return res.status(400).json({ success: false, message: 'Enter a valid email address' });

      // YYYY-MM-DD, a real date, and an adult of working age
      const dobText = typeof body.dateOfBirth === 'string' ? body.dateOfBirth.trim() : '';
      const dateOfBirth = /^\d{4}-\d{2}-\d{2}$/.test(dobText) ? new Date(`${dobText}T00:00:00Z`) : null;
      if (!dateOfBirth || Number.isNaN(dateOfBirth.getTime()) || dateOfBirth.toISOString().slice(0, 10) !== dobText) {
        return res.status(400).json({ success: false, message: 'Enter your date of birth' });
      }
      const age = (Date.now() - dateOfBirth.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (age < 18 || age > 70) return res.status(400).json({ success: false, message: 'You must be between 18 and 70 years old to apply' });

      const password = typeof body.password === 'string' ? body.password : '';
      if (password.length < 8 || password.length > 72) return res.status(400).json({ success: false, message: 'Password must be 8 to 72 characters' });

      const cities = [...new Set(list(body.cities))];
      if (!cities.length || cities.some((c) => !CITIES.includes(c))) return res.status(400).json({ success: false, message: 'Choose Jeddah and/or Makkah' });
      const skills = [...new Set(list(body.skills))];
      if (!skills.length || skills.some((s) => !SPECIALTIES.includes(s))) return res.status(400).json({ success: false, message: 'Choose at least one specialty' });

      const years = Number(body.experienceYears);
      const experienceYears = Number.isFinite(years) && years >= 0 && years <= 60 ? Math.round(years) : 0;
      const nationalId = cleanStr(body.nationalId, 30).replace(/\s+/g, '');
      if (!/^[A-Za-z0-9-]{6,30}$/.test(nationalId)) return res.status(400).json({ success: false, message: 'Enter your Iqama / ID number' });

      const photoFile = req.files && req.files.photo && req.files.photo[0];
      const idFile = req.files && req.files.idPhoto && req.files.idPhoto[0];
      const idBackFile = req.files && req.files.idPhotoBack && req.files.idPhotoBack[0];
      const passportFile = req.files && req.files.passportPhoto && req.files.passportPhoto[0];
      const certificateFile = req.files && req.files.certificatePhoto && req.files.certificatePhoto[0];
      if (!photoFile) return res.status(400).json({ success: false, message: 'Add your personal photo' });
      if (!idFile) return res.status(400).json({ success: false, message: 'Add a photo of your Iqama / ID' });
      if (!passportFile) return res.status(400).json({ success: false, message: 'Add a photo of your passport' });
      if (!certificateFile) return res.status(400).json({ success: false, message: 'Add a photo of your certificate' });

      // Same number already working for us, or already waiting for review
      if (await User.findOne({ phone: { $in: phoneVariants(phone) }, role: { $in: ['technician', 'admin'] } }).select('_id').lean()) {
        return res.status(409).json({ success: false, message: 'This number already has a technician account. Please log in.' });
      }
      if (await TechnicianApplication.findOne({ phone: { $in: phoneVariants(phone) }, status: 'pending' }).select('_id').lean()) {
        return res.status(409).json({ success: false, message: 'An application with this number is already under review.' });
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

      const application = await TechnicianApplication.create({
        fullName, phone, email, dateOfBirth, passwordHash: await bcrypt.hash(password, 10), cities, skills, experienceYears,
        about: cleanStr(body.about, 500), nationalId, idPhotoPublicId: idPhoto.public_id, idPhotoBackPublicId: idPhotoBack ? idPhotoBack.public_id : '', passportPublicId: passport.public_id, certificatePublicId: certificate.public_id,
        photoUrl: photo.secure_url,
      });
      res.status(201).json({
        success: true,
        message: 'Application received. Our team will review it and activate your account.',
        applicationId: String(application._id),
      });
    } catch (err) {
      console.error('Technician application error:', err.message);
      res.status(500).json({ success: false, message: 'Could not send your application. Please try again.' });
    }
  }
);

module.exports = router;
