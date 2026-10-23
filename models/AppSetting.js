const mongoose = require('mongoose');

// App-wide settings edited in the admin panel. A single document with key 'app'.
const DEFAULT_COMMISSION_RATE = 0.07;

const appSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'app' },
  // Company share of the amount collected on a completed booking (0.07 = 7%). Frozen on each booking at completion.
  commissionRate: { type: Number, default: DEFAULT_COMMISSION_RATE, min: 0, max: 0.5 },
  // Technician dispatch (utils/dispatch.js). While offerMode is off, bookings are auto-assigned as before.
  offerMode: { type: Boolean, default: false },
  // Minutes an open booking may wait for a technician before the admins are alerted.
  openAlertMin: { type: Number, default: 10, min: 1, max: 240 },
  lateGraceMin: { type: Number, default: 15, min: 1, max: 240 },
  maxCancelsPerDay: { type: Number, default: 3, min: 1, max: 20 },
  freezeHours: { type: Number, default: 24, min: 1, max: 720 },
  deferDays: { type: Number, default: 7, min: 1, max: 60 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: false });

const AppSetting = mongoose.models.AppSetting || mongoose.model('AppSetting', appSettingSchema);
AppSetting.DEFAULT_COMMISSION_RATE = DEFAULT_COMMISSION_RATE;

module.exports = AppSetting;
