// Phone helpers shared by auth, bookings and profile routes.
// The business serves Saudi Arabia only, so only Saudi mobile numbers (+966 5XXXXXXXX) are accepted.

const normalizePhone = (phone) => (typeof phone === 'string' ? phone.replace(/[^\d+]/g, '') : '');

// Values that may exist in the database for the same number (raw as typed, or normalized).
const phoneVariants = (phone) => {
  if (typeof phone !== 'string') return [];
  const raw = phone.trim();
  const norm = normalizePhone(phone);
  return [...new Set([raw, norm].filter(Boolean))];
};

const validatePhone = (phone) => {
  if (typeof phone !== 'string' || !phone.trim()) return { valid: false, msg: 'Phone number is required' };
  const clean = normalizePhone(phone);
  if (!clean.startsWith('+966')) {
    return { valid: false, msg: 'Only Saudi Arabia (+966) phone numbers are supported' };
  }
  return /^\+9665\d{8}$/.test(clean)
    ? { valid: true }
    : { valid: false, msg: 'Saudi number must be +966 5XXXXXXXX (9 digits starting with 5)' };
};

// Saudi Arabia only: every booking is in Saudi Arabia and priced in SAR.
const countryFromPhone = () => ({ country: 'Saudi Arabia', currency: 'SAR' });

module.exports = { normalizePhone, phoneVariants, validatePhone, countryFromPhone };
