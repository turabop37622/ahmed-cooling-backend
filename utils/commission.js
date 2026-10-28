// Commission on completed bookings, inDrive style: the company takes `rate` (default 7%) of the booking price the
// technician accepted, or of the amount collected when that is higher. Reporting a lower amount collected does not
// lower it. The rate comes from the AppSetting document and is frozen on the booking.
const AppSetting = require('../models/AppSetting');

const DEFAULT_RATE = AppSetting.DEFAULT_COMMISSION_RATE; // 0.07
const MAX_RATE = 0.5;
const MAX_AMOUNT_COLLECTED = 100000;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const validRate = (r) => typeof r === 'number' && Number.isFinite(r) && r >= 0 && r <= MAX_RATE;

// Current rate from the settings document (default when it does not exist yet or is unreadable).
const getCommissionRate = async () => {
  try {
    const doc = await AppSetting.findOne({ key: 'app' }).lean();
    return doc && validRate(doc.commissionRate) ? doc.commissionRate : DEFAULT_RATE;
  } catch (e) {
    console.error('⚠️ Commission rate read failed, using default:', e.message);
    return DEFAULT_RATE;
  }
};

// { rate, base, amount, technicianShare }: amount = base * rate rounded to 2 decimals; share = base - amount.
const computeCommission = (base, rate) => {
  const b = round2(Math.max(0, Number(base) || 0));
  const r = validRate(rate) ? rate : DEFAULT_RATE;
  const amount = round2(b * r);
  return { rate: r, base: b, amount, technicianShare: round2(b - amount) };
};

// Amount collected from the request body: undefined/null/'' -> the booking total; otherwise a number 0..100000
// (a numeric string is accepted, Arabic-Indic digits too). Returns { value } or { error }.
const ARABIC_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '٫': '.', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
const parseAmountCollected = (raw, totalAmount) => {
  if (raw === undefined || raw === null || raw === '') return { value: round2(Math.max(0, Number(totalAmount) || 0)) };
  let n;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string') {
    const s = raw.trim().replace(/[٠-٩۰-۹٫]/g, (c) => ARABIC_DIGITS[c]).replace(/,/g, '');
    n = /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  } else n = NaN;
  if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT_COLLECTED) {
    return { error: `amountCollected must be a number from 0 to ${MAX_AMOUNT_COLLECTED}` };
  }
  return { value: round2(n) };
};

// { rate, base, amount, technicianShare } for a completed job: base = the higher of the booking price and the amount
// collected; the technician keeps what they collected minus the commission (never below 0).
const jobCommission = (collected, totalAmount, rate) => {
  const c = computeCommission(Math.max(round2(Math.max(0, Number(collected) || 0)), round2(Math.max(0, Number(totalAmount) || 0))), rate);
  return { ...c, technicianShare: round2(Math.max(0, (Number(collected) || 0) - c.amount)) };
};

module.exports = { DEFAULT_RATE, MAX_RATE, MAX_AMOUNT_COLLECTED, round2, validRate, getCommissionRate, computeCommission, jobCommission, parseAmountCollected };
