const crypto = require('crypto');
const { hashOtp, safeEqual } = require('./security');

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

// Purposes keep a signup code from being reused as a password-reset code and vice versa.
const PURPOSE_VERIFY = 'verify';
const PURPOSE_RESET = 'reset';

const saveQuiet = (user) => user.save({ validateBeforeSave: false });

// True when enough time has passed since the last code was issued.
const canIssueOtp = (user) => {
  if (!user.otp || !user.otpExpires) return true;
  const issuedAt = new Date(user.otpExpires).getTime() - OTP_TTL_MS;
  return Date.now() - issuedAt >= RESEND_COOLDOWN_MS;
};

// Creates a code, stores only its hash, and returns the plain code to send to the user.
const issueOtp = async (user, purpose) => {
  const otp = crypto.randomInt(100000, 1000000).toString();
  user.otp = hashOtp(otp);
  user.otpExpires = new Date(Date.now() + OTP_TTL_MS);
  user.otpPurpose = purpose;
  user.otpAttempts = 0;
  await saveQuiet(user);
  return otp;
};

const clearOtp = (user) => {
  user.otp = undefined;
  user.otpExpires = undefined;
  user.otpPurpose = undefined;
  user.otpAttempts = 0;
};

// Takes one of the account's MAX_ATTEMPTS guesses. The counter is bumped by the database in a single
// atomic step, so a burst of parallel requests cannot all read "0 attempts used".
const reserveAttempt = async (user) => {
  const Model = user.constructor;
  if (typeof Model.findOneAndUpdate === 'function') {
    const updated = await Model.findOneAndUpdate(
      { _id: user._id, $or: [{ otpAttempts: { $lt: MAX_ATTEMPTS } }, { otpAttempts: { $exists: false } }] },
      { $inc: { otpAttempts: 1 } },
      { new: true }
    );
    if (!updated) return false;
    user.otpAttempts = updated.otpAttempts;
    return true;
  }
  if ((user.otpAttempts || 0) >= MAX_ATTEMPTS) return false;
  user.otpAttempts = (user.otpAttempts || 0) + 1;
  await saveQuiet(user);
  return true;
};

// Returns true only for a correct, unexpired code of the right purpose.
// Every check uses up one of the account's 5 guesses; when they are gone the code is destroyed.
const checkOtp = async (user, code, purpose) => {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  if (!user || !user.otp || !user.otpExpires) return false;
  if ((user.otpPurpose || PURPOSE_VERIFY) !== purpose) return false;
  if (new Date(user.otpExpires).getTime() < Date.now()) return false;

  if (!(await reserveAttempt(user))) {
    clearOtp(user);
    await saveQuiet(user);
    return false;
  }
  return safeEqual(user.otp, hashOtp(code));
};

module.exports = {
  OTP_TTL_MS, MAX_ATTEMPTS, RESEND_COOLDOWN_MS, PURPOSE_VERIFY, PURPOSE_RESET,
  canIssueOtp, issueOtp, clearOtp, checkOtp, saveQuiet,
};
