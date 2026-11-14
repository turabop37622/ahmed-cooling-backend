const mongoose = require('mongoose');

// Someone who asked on WhatsApp for a job (technician work). The bot first asks for an Iqama photo; an admin checks it
// in the admin panel (routes/adminJobLeads.js) and, if it is fine, asks for the details, which the bot then collects step
// by step (utils/whatsappJobs.js). A full account still comes from the technician application in the app.
//   awaiting_iqama -> iqama_review -> awaiting_details -> details_received   (or rejected / cancelled at any point)
const jobLeadSchema = new mongoose.Schema({
  phone: { type: String, required: true, trim: true, index: true },
  whatsappName: { type: String, trim: true, default: '' },
  language: { type: String, enum: ['en', 'ar'], default: 'en' },
  status: {
    type: String,
    enum: ['awaiting_iqama', 'iqama_review', 'awaiting_details', 'details_received', 'rejected', 'cancelled'],
    default: 'awaiting_iqama',
    index: true,
  },
  // Private ("authenticated") Cloudinary asset: only a signed link made for the admin shows it.
  iqamaPublicId: { type: String, default: '' },
  iqamaReceivedAt: { type: Date },
  // The details question the bot is waiting for an answer to (while status is awaiting_details)
  detailsStep: { type: String, enum: ['name', 'skills', 'city', 'experience', ''], default: '' },
  fullName: { type: String, trim: true, maxlength: 80, default: '' },
  skills: [{ type: String, enum: ['ac', 'refrigerator', 'washing-machine', 'stove', 'general'] }],
  cities: [{ type: String, enum: ['jeddah', 'makkah'] }],
  experienceYears: { type: Number, min: 0, max: 60 },
  rejectionReason: { type: String, trim: true, maxlength: 300, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date },
  detailsReceivedAt: { type: Date },
}, { timestamps: true, versionKey: false });

jobLeadSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.models.JobLead || mongoose.model('JobLead', jobLeadSchema);
