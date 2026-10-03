const mongoose = require('mongoose');

// Who changed what in the admin panel. Entries are only ever appended (never edited or deleted by the API).
const auditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  action: { type: String, required: true, trim: true, maxlength: 60 }, // e.g. 'booking.delete', 'booking.status'
  target: {
    kind: { type: String, trim: true, maxlength: 40 }, // e.g. 'booking', 'review', 'inquiry'
    id: { type: String, trim: true, maxlength: 64 },
    label: { type: String, trim: true, maxlength: 120 }, // human-readable reference such as the booking number
  },
  // Small summaries of the relevant fields only (never whole documents or personal data dumps).
  before: { type: mongoose.Schema.Types.Mixed },
  after: { type: mongoose.Schema.Types.Mixed },
  at: { type: Date, default: Date.now, index: true },
}, { versionKey: false });

auditLogSchema.index({ 'target.kind': 1, 'target.id': 1, at: -1 });

// Writes an entry without ever failing the request that triggered it.
auditLogSchema.statics.record = async function record({ actor, action, target, before, after }) {
  try {
    await this.create({ actor, action, target, before, after, at: new Date() });
  } catch (err) {
    console.error('⚠️ Audit log write failed:', err.message);
  }
};

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
