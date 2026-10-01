const rateLimit = require('express-rate-limit');

const { ipKeyGenerator } = rateLimit;

// One limiter per route (so a busy sign-in page cannot use up the OTP budget), keyed by visitor IP
// plus — when the request names an account — that email/phone. Someone else on the same Wi-Fi/mobile
// network does not share your budget, and an attacker cannot lock a victim out from a different IP.
const identity = (req) => {
  const b = req.body || {};
  const raw = typeof b.email === 'string' ? b.email : typeof b.phone === 'string' ? b.phone : '';
  return raw.trim().toLowerCase().slice(0, 254);
};

// identityOnly: key by the named account alone (no IP) so rotating IPs cannot brute-force one account.
const perRoute = ({ windowMs, limit, message, withIdentity = false, identityOnly = false }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
    keyGenerator: (req) => {
      if (identityOnly && identity(req)) return `id|${identity(req)}`;
      return withIdentity ? `${ipKeyGenerator(req.ip)}|${identity(req)}` : ipKeyGenerator(req.ip);
    },
  });

const attempts = (limit = 20) => perRoute({ windowMs: 15 * 60 * 1000, limit, message: 'Too many attempts. Please try again after 15 minutes.' });
const codes = (limit = 10) => perRoute({ windowMs: 10 * 60 * 1000, limit, withIdentity: true, message: 'Too many code attempts. Please wait a few minutes and try again.' });

// Public geocode proxy: each call can hit Google/OSM, so it gets a much tighter per-IP budget than the general API limit.
const geocodeLimiter = perRoute({ windowMs: 60 * 1000, limit: 20, message: 'Too many lookups. Please wait a minute and try again.' });

const mountAuthLimiters = (app) => {
  app.use('/api/auth/login', perRoute({ windowMs: 15 * 60 * 1000, limit: 20, withIdentity: true, message: 'Too many attempts. Please try again after 15 minutes.' }));
  app.use('/api/auth/register', attempts(20));
  app.use('/api/auth/phone/login', perRoute({ windowMs: 15 * 60 * 1000, limit: 20, withIdentity: true, message: 'Too many attempts. Please try again after 15 minutes.' }));
  app.use('/api/auth/phone/register', attempts(20));
  app.use('/api/auth/social', attempts(30));
  app.use('/api/admin/login', attempts(10));
  app.use('/api/admin/login', perRoute({ windowMs: 15 * 60 * 1000, limit: 10, identityOnly: true, message: 'Too many attempts. Please try again after 15 minutes.' }));
  app.use('/api/auth/forgot-password', perRoute({ windowMs: 15 * 60 * 1000, limit: 5, withIdentity: true, message: 'Too many reset requests. Please try again later.' }));
  app.use('/api/auth/verify-otp', codes(10));
  app.use('/api/auth/resend-otp', codes(5));
  app.use('/api/auth/verify-reset-otp', codes(10));
  app.use('/api/auth/reset-password', codes(10));
  app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false }));
};

module.exports = { mountAuthLimiters, geocodeLimiter, identity };
