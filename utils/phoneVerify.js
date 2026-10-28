// Proves that an app account really owns its phone number, without SMS and without a paid template:
// the app shows a 6-digit code and opens WhatsApp with "VERIFY 123456" typed in; the customer taps send.
// The message arrives from their own WhatsApp number, so Meta has already proved the number — if that number
// matches the account's number, the account is marked phoneProvenAt.
//
// Why it matters: WhatsApp bookings are attached to the app account holding that number. Without proof, anyone
// could put a stranger's number on their profile and receive that stranger's WhatsApp bookings (name, address).
const crypto = require('crypto');
const User = require('../models/User');
const { phoneVariants } = require('./phone');
const { hashOtp, safeEqual } = require('./security');

const CODE_TTL_MS = 15 * 60 * 1000;
const CODE_RE = /(?:verify|تحقق|تأكيد|توثيق)\s*[:#-]?\s*([0-9٠-٩]{6})/i;

const toLatinDigits = (s) => String(s).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

// A proven number: verified over WhatsApp, or an account the WhatsApp bot itself created (no password, no email).
const isPhoneProven = (user) => !!user && (!!user.phoneProvenAt
  || (user.authProvider === 'phone' && !user.password && !user.email));

// New code for this account (the number on the account at that moment is the one that must send it).
const startFor = async (user) => {
  const code = crypto.randomInt(100000, 1000000).toString();
  user.phoneVerifyCode = hashOtp(`${code}:${user.phone}`);
  user.phoneVerifyExpires = new Date(Date.now() + CODE_TTL_MS);
  await user.save({ validateBeforeSave: false });
  return code;
};

// Incoming WhatsApp text: returns { handled, ok } — handled=false when it is not a verification message.
const handleIncoming = async (fromPhone, text) => {
  const m = CODE_RE.exec(toLatinDigits(text || ''));
  if (!m) return { handled: false };
  const code = m[1];
  const candidates = await User.find({
    phone: { $in: phoneVariants(fromPhone) },
    phoneVerifyExpires: { $gt: new Date() },
  }).select('+phoneVerifyCode');
  const user = candidates.find((u) => u.phoneVerifyCode && safeEqual(u.phoneVerifyCode, hashOtp(`${code}:${u.phone}`)));
  if (!user) return { handled: true, ok: false };
  user.phoneProvenAt = new Date();
  user.phoneVerifyCode = undefined;
  user.phoneVerifyExpires = undefined;
  await user.save({ validateBeforeSave: false });
  return { handled: true, ok: true, user };
};

module.exports = { CODE_TTL_MS, isPhoneProven, startFor, handleIncoming };
