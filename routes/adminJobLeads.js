// Admin panel: job requests that came in on WhatsApp (utils/whatsappJobs.js). Mounted inside routes/admin.js after
// adminAuth (admin-only). The admin checks the Iqama photo, then asks for the details or says the person is not suitable.
const express = require('express');
const router = express.Router();
const JobLead = require('../models/JobLead');
const cloudinary = require('../utils/cloudinary');
const jobs = require('../utils/whatsappJobs');

const isObjectId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);
const serverError = (res) => res.status(500).json({ success: false, message: 'Server error' });
const STATUSES = ['awaiting_iqama', 'iqama_review', 'awaiting_details', 'details_received', 'rejected', 'cancelled'];

// A signed link to the private Iqama photo (only the admin panel ever gets one).
const iqamaUrl = (publicId) => (publicId
  ? cloudinary.url(publicId, { type: 'authenticated', sign_url: true, secure: true, resource_type: 'image', format: 'jpg' })
  : '');

// ?status=… (omit for the ones that need the admin: Iqama to check + details received). Also the count to review.
router.get('/job-leads', async (req, res) => {
  try {
    const status = STATUSES.includes(req.query.status) ? req.query.status : null;
    const filter = status ? { status } : { status: { $in: ['iqama_review', 'details_received'] } };
    const [leads, toReview] = await Promise.all([
      JobLead.find(filter).sort({ updatedAt: -1 }).limit(200).lean(),
      JobLead.countDocuments({ status: 'iqama_review' }),
    ]);
    res.json({ success: true, toReview, leads: leads.map((l) => ({ ...l, iqamaUrl: iqamaUrl(l.iqamaPublicId) })) });
  } catch (err) {
    console.error('Job leads list error:', err);
    serverError(res);
  }
});

// The Iqama is fine: the bot asks for name, work type, city and experience.
router.post('/job-leads/:id/ask-details', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id' });
    const lead = await JobLead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Not found' });
    if (lead.status !== 'iqama_review') return res.status(409).json({ success: false, message: 'This request is not waiting for an Iqama check' });
    try {
      await jobs.askForDetails(lead);
    } catch (err) {
      // WhatsApp only lets a business write freely within 24 h of the person's last message
      return res.status(409).json({
        success: false,
        message: 'WhatsApp did not deliver the message: more than 24 hours have passed since their last message. Ask them to send us any message on WhatsApp, then try again.',
      });
    }
    lead.reviewedBy = req.user && req.user.id;
    lead.reviewedAt = new Date();
    await lead.save();
    res.json({ success: true, lead });
  } catch (err) {
    console.error('Job lead ask-details error:', err);
    serverError(res);
  }
});

router.post('/job-leads/:id/reject', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id' });
    const lead = await JobLead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Not found' });
    if (['rejected', 'cancelled'].includes(lead.status)) return res.status(409).json({ success: false, message: 'Already closed' });
    const result = await jobs.rejectLead(lead, typeof req.body.reason === 'string' ? req.body.reason.trim() : '');
    lead.reviewedBy = req.user && req.user.id;
    lead.reviewedAt = new Date();
    await lead.save();
    res.json({ success: true, messaged: result.messaged });
  } catch (err) {
    console.error('Job lead reject error:', err);
    serverError(res);
  }
});

module.exports = router;
