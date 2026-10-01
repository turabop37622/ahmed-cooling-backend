const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Escape any value so it is safe inside HTML text or attribute values.
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

// Escape every string field of a flat object (used for email template data).
const escapeFields = (obj = {}) => {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = typeof value === 'string' ? escapeHtml(value) : value;
  }
  return out;
};

const cleanStr = (value, max = 500) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const normEmail = (value) => (typeof value === 'string' ? value.trim().toLowerCase().slice(0, 254) : '');
const isEmail = (value) => typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value);

const PASSWORD_MIN = 6;
const PASSWORD_MAX = 72; // bcrypt only uses the first 72 bytes
const isValidPassword = (value) => typeof value === 'string' && value.length >= PASSWORD_MIN && value.length <= PASSWORD_MAX;

const hashOtp = (otp) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(String(otp)).digest('hex');

const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

// Reject request bodies/queries/params that contain MongoDB operators ({"$ne": null}) or dotted keys.
const containsOperator = (value, depth = 0) => {
  if (value === null || typeof value !== 'object') return false;
  if (depth > 8) return true; // absurdly deep input is treated as hostile
  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key.includes('.')) return true;
    if (containsOperator(value[key], depth + 1)) return true;
  }
  return false;
};

const rejectMongoOperators = (req, res, next) => {
  if (containsOperator(req.body) || containsOperator(req.query) || containsOperator(req.params)) {
    return res.status(400).json({ success: false, message: 'Invalid request' });
  }
  next();
};

const isFutureOrToday = (isoDate) => {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== isoDate) return false;
  // Allow "today" in any timezone (UTC-12 .. UTC+14) by tolerating one day of slack.
  return parsed.getTime() >= Date.now() - 36 * 60 * 60 * 1000;
};

// The booking page sends '09:00 AM'-style slots, or 'Anytime' when no slot is picked.
const isValidTime = (value) =>
  typeof value === 'string' &&
  (/^([01]?\d|2[0-3]):[0-5]\d(\s?(AM|PM))?$/i.test(value.trim()) || /^anytime$/i.test(value.trim()));

// Unknown emails still pay for one bcrypt compare, so response time does not reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', 10);
const burnPasswordCheck = async (password) => {
  try { await bcrypt.compare(typeof password === 'string' ? password : '', DUMMY_HASH); } catch { /* ignore */ }
};

module.exports = {
  burnPasswordCheck,
  escapeHtml, escapeFields, cleanStr, normEmail, isEmail, isValidPassword,
  PASSWORD_MIN, PASSWORD_MAX, hashOtp, safeEqual, rejectMongoOperators, containsOperator,
  isFutureOrToday, isValidTime,
};
