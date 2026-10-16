// Phone helpers shared by auth, bookings, profile and admin routes.
// The business serves Saudi Arabia only, so only Saudi mobile numbers (+966 5XXXXXXXX) are accepted.
// Every way of writing the same mobile (05XXXXXXXX, 5XXXXXXXX, 9665..., 009665..., +9665..., Arabic-Indic digits,
// spaces/dashes) is reduced to one canonical form: +9665XXXXXXXX.

// Arabic-Indic (U+0660-0669) and Eastern Arabic-Indic / Persian (U+06F0-06F9) digits -> ASCII.
const toAsciiDigits = (s) => s
  .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06F0));

// '+9665XXXXXXXX' for any spelling of a Saudi mobile number, otherwise null.
const canonicalSaudiMobile = (phone) => {
  if (typeof phone !== 'string') return null;
  const digits = toAsciiDigits(phone).replace(/\D/g, '');
  const m = /^(?:00966|966|0)?(5\d{8})$/.exec(digits);
  return m ? `+966${m[1]}` : null;
};

// Canonical +9665XXXXXXXX when the value is a Saudi mobile; otherwise only digits and '+' are kept (so a foreign
// number such as +92... stays recognisable and is rejected by validatePhone).
const normalizePhone = (phone) => {
  if (typeof phone !== 'string') return '';
  return canonicalSaudiMobile(phone) || toAsciiDigits(phone).replace(/[^\d+]/g, '');
};

// Values that may exist in the database for the same number: as typed, normalised, and the older spellings of the
// canonical number (records saved before numbers were normalised).
const phoneVariants = (phone) => {
  if (typeof phone !== 'string') return [];
  const raw = phone.trim();
  const out = [raw, toAsciiDigits(raw).replace(/[^\d+]/g, '')];
  const canonical = canonicalSaudiMobile(phone);
  if (canonical) {
    const national = canonical.slice(4); // 5XXXXXXXX
    out.push(canonical, `0${national}`, `966${national}`, `00966${national}`, national);
  }
  return [...new Set(out.filter(Boolean))];
};

const validatePhone = (phone) => {
  if (typeof phone !== 'string' || !phone.trim()) return { valid: false, msg: 'Phone number is required' };
  if (canonicalSaudiMobile(phone)) return { valid: true };
  const clean = normalizePhone(phone);
  if (clean.startsWith('+') && !clean.startsWith('+966')) {
    return { valid: false, msg: 'Only Saudi Arabia (+966) phone numbers are supported' };
  }
  return { valid: false, msg: 'Saudi number must be +966 5XXXXXXXX (9 digits starting with 5)' };
};

// Saudi Arabia only: every booking is in Saudi Arabia and priced in SAR.
const countryFromPhone = () => ({ country: 'Saudi Arabia', currency: 'SAR' });

module.exports = { normalizePhone, canonicalSaudiMobile, phoneVariants, validatePhone, countryFromPhone, toAsciiDigits };
