const mongoose = require('mongoose');

// App-wide settings edited in the admin panel. A single document with key 'app'.
const DEFAULT_COMMISSION_RATE = 0.07;

const appSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'app' },
  // Company share of the amount collected on a completed booking (0.07 = 7%). Frozen on each booking at completion.
  commissionRate: { type: Number, default: DEFAULT_COMMISSION_RATE, min: 0, max: 0.5 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: false });

const AppSetting = mongoose.models.AppSetting || mongoose.model('AppSetting', appSettingSchema);
AppSetting.DEFAULT_COMMISSION_RATE = DEFAULT_COMMISSION_RATE;

module.exports = AppSetting;
