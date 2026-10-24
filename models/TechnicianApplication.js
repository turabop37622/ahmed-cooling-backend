const mongoose = require('mongoose');

// A technician who applied from the app (POST /api/technician-applications). Nothing can log in or work until an admin
// approves it (routes/adminApplications.js), which creates the real User + Technician profile. The password the
// applicant chose is kept only as a bcrypt hash and becomes the account's password on approval.
const technicianApplicationSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 80 },
  phone: { type: String, required: true, trim: true, index: true },
  email: { type: String, trim: true, lowercase: true, default: '' },
  passwordHash: { type: String, required: true, select: false },
  cities: [{ type: String, enum: ['jeddah', 'makkah'] }],
  skills: [{ type: String, enum: ['ac', 'refrigerator', 'washing-machine', 'stove', 'general'] }],
  experienceYears: { type: Number, min: 0, max: 60, default: 0 },
  about: { type: String, trim: true, maxlength: 500, default: '' },
  nationalId: { type: String, required: true, trim: true, maxlength: 30 },
  dateOfBirth: { type: Date, required: true },
  // The ID photo is stored as a private ("authenticated") Cloudinary asset: only a signed link made for the admin shows it.
  idPhotoPublicId: { type: String, required: true },
  // Back of the Iqama / ID (private as well). Optional so older applications without it stay valid.
  idPhotoBackPublicId: { type: String, default: '' },
  // Passport and skill certificate photos: private as well, shown to the admin through signed links only.
  passportPublicId: { type: String, default: '' },
  certificatePublicId: { type: String, default: '' },
  photoUrl: { type: String, required: true },
  // The applicant's device (FCM / Expo token) so the approval or rejection reaches the phone before they have an account.
  pushTokens: [{ token: String, kind: { type: String, enum: ['fcm', 'expo'] }, platform: String, _id: false }],
  // changes_requested = the admin sent it back with a message; the applicant fixes it and it becomes pending again.
  status: { type: String, enum: ['pending', 'changes_requested', 'approved', 'rejected'], default: 'pending', index: true },
  adminMessage: { type: String, trim: true, maxlength: 500, default: '' },
  changesRequestedAt: { type: Date },
  resubmittedAt: { type: Date },
  rejectionReason: { type: String, trim: true, maxlength: 500, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

technicianApplicationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.TechnicianApplication || mongoose.model('TechnicianApplication', technicianApplicationSchema);
