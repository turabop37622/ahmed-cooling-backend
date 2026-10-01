const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const User = require('../models/User');
const Technician = require('../models/Technician');
const Notification = require('../models/Notification');
const catalogueServices = require('../web/src/lib/services.json');
const { body, validationResult } = require('express-validator');
const axios = require('axios');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { escapeHtml, escapeFields, cleanStr, isFutureOrToday, isValidTime } = require('../utils/security');
const { validatePhone, phoneVariants, countryFromPhone } = require('../utils/phone');

// ============================================
// CONFIG
// ============================================
const JWT_SECRET = process.env.JWT_SECRET;
const auth = require('../middleware/auth');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const SENDER_EMAIL = process.env.EMAIL_FROM || ADMIN_EMAIL;
const BACKEND_URL = process.env.BACKEND_URL || 'https://ahmed-cooling-backend.onrender.com';
const VISIT_CHARGE = (() => {
  const raw = process.env.VISIT_CHARGE;
  const n = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 30; // a bad env value must never turn into NaN prices
})();
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || '';
// Email subjects are plain text (not HTML), so they use the raw values — just without line breaks.
const subjectLine = (text) => String(text).replace(/[\r\n]+/g, ' ').slice(0, 200);
const ownsBooking = (booking, user) => user.role === 'admin' || (booking.user && booking.user.toString() === String(user.id));
const isAssignedTechnician = (booking, user) => user.role === 'technician' && !!booking.technician && String(booking.technician._id || booking.technician) === String(user.id);
// Optional header that makes a create request safe to retry (same user + same key = same booking).
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;

// ============================================
// AUTH MIDDLEWARE
// ============================================
const phoneValidator = (value) => {
  const result = validatePhone(value);
  if (!result.valid) throw new Error(result.msg);
  return true;
};

// ============================================
// ✅ EMAIL: USER - Booking Received (Pending)
// ============================================
const sendBookingReceivedEmail = async (toEmail, rawData) => {
  try {
    const data = escapeFields(rawData);
    if (!toEmail) return;
    const { bookingId, orderNumber, customerName, serviceName, serviceIcon, date, time, address, servicePrice, visitCharges, totalAmount, currency } = data;
    const cur = currency || 'SAR';

    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: "Ahmed Cooling Workshop", email: SENDER_EMAIL },
      to: [{ email: toEmail }],
      subject: `📋 Booking Received - ${bookingId} | Ahmed Cooling`,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
          <div style="background:linear-gradient(135deg,#3B82F6,#1D4ED8);padding:32px 24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:26px;">❄️ Ahmed Cooling Workshop</h1>
            <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;">Booking Request Received</p>
          </div>
          <div style="background:#ECFDF5;padding:14px 24px;text-align:center;border-bottom:2px solid #A7F3D0;">
            <p style="color:#065F46;font-size:17px;font-weight:bold;margin:0;">📋 Booking Received - Pending Confirmation</p>
            <p style="color:#047857;margin:4px 0 0;font-size:13px;">Admin will confirm your booking shortly</p>
          </div>
          <div style="background:#fff;padding:28px 24px;">
            <p style="color:#374151;font-size:15px;">Dear <strong>${customerName}</strong>, we have received your booking request!</p>
            <div style="background:#EFF6FF;border-left:4px solid #3B82F6;border-radius:8px;padding:14px 18px;margin:16px 0;">
              <p style="margin:0;font-size:13px;color:#6B7280;">Booking ID</p>
              <p style="margin:4px 0 0;font-size:22px;font-weight:bold;color:#1D4ED8;">${bookingId}</p>
              <p style="margin:4px 0 0;font-size:12px;color:#9CA3AF;">Order: ${orderNumber}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
              <tr style="background:#F9FAFB;"><td style="padding:11px 14px;font-size:13px;color:#6B7280;width:40%;">🔧 Service</td><td style="padding:11px 14px;font-size:14px;font-weight:600;">${serviceIcon || '❄️'} ${serviceName}</td></tr>
              <tr><td style="padding:11px 14px;font-size:13px;color:#6B7280;">📅 Date</td><td style="padding:11px 14px;font-size:14px;font-weight:600;">${date}</td></tr>
              <tr style="background:#F9FAFB;"><td style="padding:11px 14px;font-size:13px;color:#6B7280;">🕐 Time</td><td style="padding:11px 14px;font-size:14px;font-weight:600;">${time}</td></tr>
              <tr><td style="padding:11px 14px;font-size:13px;color:#6B7280;">📍 Address</td><td style="padding:11px 14px;font-size:14px;font-weight:600;">${address}</td></tr>
            </table>
            <div style="background:#F9FAFB;border-radius:10px;padding:16px;margin-bottom:20px;">
              <p style="font-size:14px;font-weight:bold;color:#374151;margin:0 0 10px;">💰 Price Summary</p>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="font-size:13px;color:#6B7280;">Service Charge</span><span style="font-size:13px;">${cur} ${servicePrice || 0}</span></div>
              <div style="display:flex;justify-content:space-between;margin-bottom:10px;"><span style="font-size:13px;color:#6B7280;">Visit Fee</span><span style="font-size:13px;">${cur} ${visitCharges ?? VISIT_CHARGE}</span></div>
              <div style="border-top:1px solid #E5E7EB;padding-top:10px;display:flex;justify-content:space-between;"><span style="font-size:15px;font-weight:bold;">Total</span><span style="font-size:18px;font-weight:bold;color:#3B82F6;">${cur} ${totalAmount}</span></div>
            </div>
            <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:12px 16px;">
              <p style="margin:0;font-size:13px;color:#92400E;">⏰ You will receive another email once your booking is confirmed by admin.</p>
            </div>
          </div>
          <div style="background:#1F2937;padding:18px 24px;text-align:center;">
            <p style="color:#9CA3AF;font-size:12px;margin:0;">© 2025 Ahmed Cooling & Appliances Workshop${SUPPORT_PHONE ? ` | 📞 ${escapeHtml(SUPPORT_PHONE)}` : ''}</p>
          </div>
        </div>
      `
    }, { headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 });

    console.log('✅ User received email sent');
  } catch (err) {
    console.error('❌ User email failed:', err.response?.data || err.message);
  }
};

// ============================================
// ✅ EMAIL: USER - Booking Confirmed by Admin
// ============================================
const sendBookingConfirmedEmail = async (toEmail, rawData) => {
  try {
    const data = escapeFields(rawData);
    if (!toEmail) return;
    const { bookingId, customerName, serviceName, serviceIcon, date, time, address, totalAmount, currency } = data;
    const cur = currency || 'SAR';

    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: "Ahmed Cooling Workshop", email: SENDER_EMAIL },
      to: [{ email: toEmail }],
      subject: `🎉 Booking CONFIRMED - ${bookingId} | Ahmed Cooling`,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
          <div style="background:linear-gradient(135deg,#10B981,#059669);padding:32px 24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:26px;">❄️ Ahmed Cooling Workshop</h1>
            <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;">Booking Confirmed!</p>
          </div>
          <div style="background:#ECFDF5;padding:14px 24px;text-align:center;border-bottom:2px solid #A7F3D0;">
            <p style="color:#065F46;font-size:20px;font-weight:bold;margin:0;">🎉 Your Booking is CONFIRMED!</p>
            <p style="color:#047857;margin:4px 0 0;font-size:13px;">Our team will arrive on the scheduled time</p>
          </div>
          <div style="background:#fff;padding:28px 24px;">
            <p style="color:#374151;font-size:15px;">Dear <strong>${customerName}</strong>, great news! Your booking has been confirmed by our admin.</p>
            <div style="background:#EFF6FF;border-left:4px solid #10B981;border-radius:8px;padding:14px 18px;margin:16px 0;">
              <p style="margin:0;font-size:13px;color:#6B7280;">Confirmed Booking ID</p>
              <p style="margin:4px 0 0;font-size:22px;font-weight:bold;color:#059669;">${bookingId}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
              <tr style="background:#F9FAFB;"><td style="padding:11px 14px;font-size:13px;color:#6B7280;width:40%;">🔧 Service</td><td style="padding:11px 14px;font-size:14px;font-weight:600;">${serviceIcon || '❄️'} ${serviceName}</td></tr>
              <tr><td style="padding:11px 14px;font-size:13px;color:#6B7280;">📅 Date</td><td style="padding:11px 14px;font-size:14px;font-weight:600;">${date}</td></tr>
              <tr style="background:#F9FAFB;"><td style="padding:11px 14px;font-size:13px;color:#6B7280;">🕐 Time</td><td style="padding:11px 14px;font-size:14px;font-weight:600;">${time}</td></tr>
              <tr><td style="padding:11px 14px;font-size:13px;color:#6B7280;">📍 Address</td><td style="padding:11px 14px;font-size:14px;font-weight:600;">${address}</td></tr>
              <tr style="background:#F9FAFB;"><td style="padding:11px 14px;font-size:13px;color:#6B7280;">💰 Total</td><td style="padding:11px 14px;font-size:16px;font-weight:bold;color:#059669;">${cur} ${totalAmount}</td></tr>
            </table>
            <div style="background:#FEF3C7;border-radius:8px;padding:14px;text-align:center;">
              <p style="margin:0;color:#92400E;font-size:13px;">💡 Payment will be collected after service completion (Cash only)</p>
            </div>
          </div>
          <div style="background:#1F2937;padding:18px 24px;text-align:center;">
            <p style="color:#9CA3AF;font-size:12px;margin:0;">© 2025 Ahmed Cooling & Appliances Workshop${SUPPORT_PHONE ? ` | 📞 ${escapeHtml(SUPPORT_PHONE)}` : ''}</p>
          </div>
        </div>
      `
    }, { headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 });

    console.log('✅ User confirmed email sent');
  } catch (err) {
    console.error('❌ Confirmed email failed:', err.response?.data || err.message);
  }
};

// ============================================
// ✅ EMAIL: CUSTOMER - Booking Cancelled (NEW FIX)
// ============================================
const sendCustomerCancellationEmail = async (toEmail, rawData) => {
  try {
    const data = escapeFields(rawData);
    if (!toEmail) return;
    const { bookingId, customerName, serviceName, serviceIcon, date, time, cancellationReason } = data;

    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: "Ahmed Cooling Workshop", email: SENDER_EMAIL },
      to: [{ email: toEmail }],
      subject: `❌ Booking Cancelled - ${bookingId} | Ahmed Cooling`,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
          <div style="background:linear-gradient(135deg,#EF4444,#DC2626);padding:32px 24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:26px;">❄️ Ahmed Cooling Workshop</h1>
            <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;">Booking Cancellation Notice</p>
          </div>
          <div style="background:#FEF2F2;padding:14px 24px;text-align:center;border-bottom:2px solid #FECACA;">
            <p style="color:#991B1B;font-size:18px;font-weight:bold;margin:0;">❌ Your Booking Has Been Cancelled</p>
          </div>
          <div style="background:#fff;padding:28px 24px;">
            <p style="color:#374151;font-size:15px;">Dear <strong>${customerName}</strong>, your booking has been cancelled.</p>
            <div style="background:#FEF2F2;border-left:4px solid #EF4444;border-radius:8px;padding:14px 18px;margin:16px 0;">
              <p style="margin:0;font-size:13px;color:#6B7280;">Booking ID</p>
              <p style="margin:4px 0 0;font-size:22px;font-weight:bold;color:#DC2626;">${bookingId}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
              <tr style="background:#F9FAFB;"><td style="padding:11px 14px;font-size:13px;color:#6B7280;width:40%;">🔧 Service</td><td style="padding:11px 14px;font-size:14px;font-weight:600;">${serviceIcon || '❄️'} ${serviceName}</td></tr>
              <tr><td style="padding:11px 14px;font-size:13px;color:#6B7280;">📅 Date</td><td style="padding:11px 14px;font-size:14px;font-weight:600;">${date}</td></tr>
              <tr style="background:#F9FAFB;"><td style="padding:11px 14px;font-size:13px;color:#6B7280;">🕐 Time</td><td style="padding:11px 14px;font-size:14px;font-weight:600;">${time}</td></tr>
            </table>
            ${cancellationReason ? `
            <div style="background:#FEE2E2;border-radius:10px;padding:14px;margin-bottom:20px;border-left:4px solid #DC2626;">
              <p style="color:#991B1B;font-size:13px;font-weight:600;margin:0 0 6px;">❌ Cancellation Reason:</p>
              <p style="color:#7F1D1D;font-size:13px;margin:0;">${cancellationReason}</p>
            </div>` : ''}
            <div style="background:#EFF6FF;border-radius:8px;padding:14px;text-align:center;">
              <p style="margin:0;font-size:13px;color:#1D4ED8;">${SUPPORT_PHONE ? `Need help? Call us at <strong>${escapeHtml(SUPPORT_PHONE)}</strong>` : 'Need help? Just reply to this email.'}</p>
              <p style="margin:6px 0 0;font-size:13px;color:#1D4ED8;">You can book a new appointment anytime through our app.</p>
            </div>
          </div>
          <div style="background:#1F2937;padding:18px 24px;text-align:center;">
            <p style="color:#9CA3AF;font-size:12px;margin:0;">© 2025 Ahmed Cooling & Appliances Workshop${SUPPORT_PHONE ? ` | 📞 ${escapeHtml(SUPPORT_PHONE)}` : ''}</p>
          </div>
        </div>
      `
    }, { headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 });

    console.log('✅ Customer cancellation email sent to:', toEmail);
  } catch (err) {
    console.error('❌ Customer cancel email failed:', err.response?.data || err.message);
  }
};

// ============================================
// ✅ EMAIL: ADMIN - Booking Cancellation Alert
// ============================================
const sendBookingCancellationEmail = async (rawData) => {
  try {
    const data = escapeFields(rawData);
    const { bookingId, orderNumber, customerName, customerPhone, serviceName, serviceIcon, date, time, cancellationReason } = data;

    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: "Ahmed Cooling - System", email: SENDER_EMAIL },
      to: [{ email: ADMIN_EMAIL }],
      subject: subjectLine(`🚨 Booking CANCELLED: ${bookingId} | ${rawData.customerName}`),
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.15);">
          
          <!-- ALERT Header -->
          <div style="background:linear-gradient(135deg,#DC2626,#991B1B);padding:24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:22px;">🚨 Booking CANCELLED!</h1>
            <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Customer ne apni booking cancel kar di</p>
          </div>

          <!-- Alert Banner -->
          <div style="background:#FEF3C7;padding:14px 24px;text-align:center;border-bottom:2px solid #FDE68A;">
            <p style="color:#92400E;font-size:16px;font-weight:bold;margin:0;">⚠️ Action Taken by Customer</p>
            <p style="color:#B45309;margin:4px 0 0;font-size:13px;">Booking ID: <strong>${bookingId}</strong></p>
          </div>

          <div style="background:#fff;padding:28px 24px;">

            <!-- Customer Info -->
            <h3 style="color:#111827;font-size:15px;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #E5E7EB;">👤 Customer Information</h3>
            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
              <tr style="background:#F9FAFB;"><td style="padding:10px 14px;font-size:13px;color:#6B7280;width:35%;">Name</td><td style="padding:10px 14px;font-size:14px;font-weight:600;">${customerName}</td></tr>
              <tr><td style="padding:10px 14px;font-size:13px;color:#6B7280;">Phone</td><td style="padding:10px 14px;font-size:14px;font-weight:600;"><a href="tel:${customerPhone}" style="color:#3B82F6;">${customerPhone}</a></td></tr>
            </table>

            <!-- Booking Info -->
            <h3 style="color:#111827;font-size:15px;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #E5E7EB;">📋 Cancelled Booking Details</h3>
            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
              <tr style="background:#F9FAFB;"><td style="padding:10px 14px;font-size:13px;color:#6B7280;width:35%;">Service</td><td style="padding:10px 14px;font-size:14px;font-weight:600;">${serviceIcon || '❄️'} ${serviceName}</td></tr>
              <tr><td style="padding:10px 14px;font-size:13px;color:#6B7280;">Date</td><td style="padding:10px 14px;font-size:14px;font-weight:600;">📅 ${date}</td></tr>
              <tr style="background:#F9FAFB;"><td style="padding:10px 14px;font-size:13px;color:#6B7280;">Time</td><td style="padding:10px 14px;font-size:14px;font-weight:600;">🕐 ${time}</td></tr>
              <tr><td style="padding:10px 14px;font-size:13px;color:#6B7280;">Order #</td><td style="padding:10px 14px;font-size:14px;font-weight:600;">${orderNumber}</td></tr>
            </table>

            <!-- Cancellation Reason -->
            ${cancellationReason ? `
            <div style="background:#FEE2E2;border-radius:10px;padding:14px;margin-bottom:24px;border-left:4px solid #DC2626;">
              <p style="color:#991B1B;font-size:13px;font-weight:600;margin:0 0 6px;">❌ Cancellation Reason:</p>
              <p style="color:#7F1D1D;font-size:13px;margin:0;">${cancellationReason}</p>
            </div>
            ` : ''}

            <div style="background:#EFF6FF;border-radius:8px;padding:12px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#1D4ED8;">Customer ne is booking ko cancel kar diya hai.</p>
              <p style="margin:4px 0 0;font-size:12px;color:#1D4ED8;">Agar re-booking chahiye to directly contact karein.</p>
            </div>
          </div>

          <div style="background:#1F2937;padding:18px 24px;text-align:center;">
            <p style="color:#9CA3AF;font-size:12px;margin:0;">© 2025 Ahmed Cooling Admin System</p>
          </div>
        </div>
      `
    }, { headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 });

    console.log('✅ Cancellation email sent to admin');
  } catch (err) {
    console.error('❌ Cancellation email failed:', err.response?.data || err.message);
  }
};

// ============================================
// ✅ EMAIL: ADMIN - New Booking with Confirm/Cancel Buttons
// ============================================
const sendAdminNotificationEmail = async (rawData) => {
  try {
    const data = escapeFields(rawData);
    const { bookingId, orderNumber, customerName, customerEmail, customerPhone, serviceName, serviceIcon, date, time, address, comments, servicePrice, visitCharges, totalAmount, country, currency } = data;
    const currSymbol = currency || 'SAR';
    const countryName = country || 'Saudi Arabia';

    // ✅ Secure token - 7 din valid
    const confirmToken = jwt.sign({ bookingId, action: 'confirm' }, JWT_SECRET, { expiresIn: '7d' });
    const cancelToken = jwt.sign({ bookingId, action: 'cancel' }, JWT_SECRET, { expiresIn: '7d' });
    const confirmUrl = `${BACKEND_URL}/api/bookings/admin/confirm/${bookingId}?token=${confirmToken}`;
    const cancelUrl  = `${BACKEND_URL}/api/bookings/admin/cancel/${bookingId}?token=${cancelToken}`;

    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: "Ahmed Cooling - System", email: SENDER_EMAIL },
      to: [{ email: ADMIN_EMAIL }],
      subject: subjectLine(`🔔 New Booking: ${bookingId} | 🇸🇦 Saudi | ${rawData.customerName} | ${rawData.serviceName}`),
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.15);">
          
          <!-- Admin Header -->
          <div style="background:linear-gradient(135deg,#DC2626,#991B1B);padding:24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:22px;">🔔 New Booking Alert!</h1>
            <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Ahmed Cooling Admin Panel • 🇸🇦 Kingdom of Saudi Arabia</p>
          </div>

          <!-- Alert -->
          <div style="background:#FEF3C7;padding:14px 24px;text-align:center;border-bottom:2px solid #FDE68A;">
            <p style="color:#92400E;font-size:16px;font-weight:bold;margin:0;">⚡ Action Required - New Booking (${countryName})</p>
            <p style="color:#B45309;margin:4px 0 0;font-size:13px;">Booking ID: <strong>${bookingId}</strong></p>
          </div>

          <div style="background:#fff;padding:28px 24px;">

            <!-- Customer Info -->
            <h3 style="color:#111827;font-size:15px;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #E5E7EB;">👤 Customer Information</h3>
            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
              <tr style="background:#F9FAFB;"><td style="padding:10px 14px;font-size:13px;color:#6B7280;width:35%;">Country</td><td style="padding:10px 14px;font-size:14px;font-weight:700;color:#1E40AF;">🇸🇦 Saudi Arabia</td></tr>
              <tr><td style="padding:10px 14px;font-size:13px;color:#6B7280;width:35%;">Full Name</td><td style="padding:10px 14px;font-size:14px;font-weight:600;">${customerName}</td></tr>
              <tr style="background:#F9FAFB;"><td style="padding:10px 14px;font-size:13px;color:#6B7280;">Email</td><td style="padding:10px 14px;font-size:14px;font-weight:600;"><a href="mailto:${customerEmail}" style="color:#3B82F6;">${customerEmail || 'N/A'}</a></td></tr>
              <tr><td style="padding:10px 14px;font-size:13px;color:#6B7280;">Phone</td><td style="padding:10px 14px;font-size:14px;font-weight:600;"><a href="tel:${customerPhone}" style="color:#3B82F6;">${customerPhone}</a></td></tr>
              <tr style="background:#F9FAFB;"><td style="padding:10px 14px;font-size:13px;color:#6B7280;">Address</td><td style="padding:10px 14px;font-size:14px;font-weight:600;">${address}</td></tr>
            </table>

            <!-- Booking Info -->
            <h3 style="color:#111827;font-size:15px;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #E5E7EB;">📋 Booking Details</h3>
            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
              <tr style="background:#F9FAFB;"><td style="padding:10px 14px;font-size:13px;color:#6B7280;width:35%;">Service</td><td style="padding:10px 14px;font-size:14px;font-weight:600;">${serviceIcon || '❄️'} ${serviceName}</td></tr>
              <tr><td style="padding:10px 14px;font-size:13px;color:#6B7280;">Date</td><td style="padding:10px 14px;font-size:14px;font-weight:600;">📅 ${date}</td></tr>
              <tr style="background:#F9FAFB;"><td style="padding:10px 14px;font-size:13px;color:#6B7280;">Time</td><td style="padding:10px 14px;font-size:14px;font-weight:600;">🕐 ${time}</td></tr>
              <tr><td style="padding:10px 14px;font-size:13px;color:#6B7280;">Order #</td><td style="padding:10px 14px;font-size:14px;font-weight:600;">${orderNumber}</td></tr>
              ${comments ? `<tr style="background:#F9FAFB;"><td style="padding:10px 14px;font-size:13px;color:#6B7280;">Notes</td><td style="padding:10px 14px;font-size:14px;color:#374151;">${comments}</td></tr>` : ''}
            </table>

            <!-- Price -->
            <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:16px;margin-bottom:28px;">
              <h3 style="color:#065F46;font-size:14px;margin:0 0 10px;">💰 Price Summary</h3>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="font-size:13px;color:#374151;">Service Charge</span><span style="font-size:13px;">${currSymbol} ${servicePrice || 0}</span></div>
              <div style="display:flex;justify-content:space-between;margin-bottom:10px;"><span style="font-size:13px;color:#374151;">Visit Fee</span><span style="font-size:13px;">${currSymbol} ${visitCharges ?? VISIT_CHARGE}</span></div>
              <div style="border-top:1px solid #BBF7D0;padding-top:10px;display:flex;justify-content:space-between;">
                <span style="font-size:15px;font-weight:bold;color:#065F46;">Total Amount</span>
                <span style="font-size:20px;font-weight:bold;color:#059669;">${currSymbol} ${totalAmount}</span>
              </div>
            </div>
            </div>

            <!-- ✅ ACTION BUTTONS -->
            <div style="text-align:center;margin-bottom:20px;">
              <p style="color:#374151;font-size:15px;font-weight:bold;margin-bottom:20px;">🎯 Booking par action lein:</p>
              
              <a href="${confirmUrl}" style="display:inline-block;background:linear-gradient(135deg,#10B981,#059669);color:#fff;text-decoration:none;padding:16px 36px;border-radius:12px;font-size:16px;font-weight:bold;margin:0 6px 12px;box-shadow:0 4px 12px rgba(16,185,129,0.4);">
                ✅ Confirm Booking
              </a>
              
              <br/>
              
              <a href="${cancelUrl}" style="display:inline-block;background:linear-gradient(135deg,#EF4444,#DC2626);color:#fff;text-decoration:none;padding:16px 36px;border-radius:12px;font-size:16px;font-weight:bold;margin:0 6px 12px;box-shadow:0 4px 12px rgba(239,68,68,0.4);">
                ❌ Cancel Booking
              </a>
            </div>

            <div style="background:#EFF6FF;border-radius:8px;padding:12px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#1D4ED8;">🔒 Yeh links 7 din tak valid hain. Click karne par booking automatically update hogi aur customer ko email jayegi.</p>
            </div>
          </div>

          <div style="background:#1F2937;padding:18px 24px;text-align:center;">
            <p style="color:#9CA3AF;font-size:12px;margin:0;">© 2025 Ahmed Cooling Admin System</p>
          </div>
        </div>
      `
    }, { headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 });

    console.log('✅ Admin notification email sent to:', ADMIN_EMAIL);
  } catch (err) {
    console.error('❌ Admin email failed:', err.response?.data || err.message);
  }
};

// ============================================
// ✅ ADMIN CONFIRM BOOKING - Email button se
// ============================================
const emailActionPage = (action) => (req, res) => {
  try {
    const decoded = jwt.verify(String(req.query.token || ''), JWT_SECRET, { algorithms: ['HS256'] });
    if (decoded.bookingId !== req.params.bookingId || decoded.action !== action) throw new Error('Invalid link');
    const path = `/api/bookings/admin/${action}/${encodeURIComponent(req.params.bookingId)}`;
    res.set('Cache-Control', 'no-store').send(`<html><body><h1>${action === 'confirm' ? 'Confirm' : 'Cancel'} booking</h1><form method="post" action="${escapeHtml(path)}"><input type="hidden" name="token" value="${escapeHtml(req.query.token)}"><button type="submit">Continue</button></form></body></html>`);
  } catch {
    res.status(403).send('Invalid or expired link');
  }
};
router.get('/admin/confirm/:bookingId', emailActionPage('confirm'));
router.get('/admin/cancel/:bookingId', emailActionPage('cancel'));

router.post('/admin/confirm/:bookingId', async (req, res) => {
  try {
    const { token } = req.body;
    const { bookingId } = req.params;

    // Token verify
    let decoded;
    try {
      decoded = jwt.verify(String(token || ''), JWT_SECRET, { algorithms: ['HS256'] });
      if (decoded.bookingId !== bookingId || decoded.action !== 'confirm') throw new Error('Wrong action');
    } catch (e) {
      return res.send(adminPage('❌ Link Expired!', '#EF4444', '#FEF2F2', 'Yeh confirmation link expire ho gaya hai (7 din baad expire hoti hai).'));
    }

    const booking = await Booking.findOne({ bookingId: String(bookingId) });
    if (!booking) return res.send(adminPage('❌ Booking Not Found', '#EF4444', '#FEF2F2', `Booking ID: ${escapeHtml(bookingId)} nahi mili.`));

    if (booking.status === 'confirmed') {
      return res.send(adminPage('✅ Already Confirmed!', '#10B981', '#F0FDF4', `Yeh booking pehle se confirm ho chuki hai.<br><br>Customer: ${escapeHtml(booking.customerName)}<br>Phone: ${escapeHtml(booking.phone)}`));
    }

    // The email link may only confirm a booking that is still waiting; it must never move a
    // completed / in-progress / assigned booking backwards.
    if (booking.status !== 'pending') {
      return res.send(adminPage('⚠️ Cannot Confirm', '#F59E0B', '#FFFBEB', `Yeh booking ab ${escapeHtml(booking.status)} hai, is link se confirm nahi ho sakti.`));
    }

    // Confirm karo
    booking.status = 'confirmed';
    booking.statusHistory.push({ status: 'confirmed', timestamp: new Date(), note: 'Confirmed by admin via email link' });
    await booking.save();

    // User ko confirmed email bhejo
    const serviceData = typeof booking.service === 'object' ? booking.service : {};
    if (booking.email) {
      sendBookingConfirmedEmail(booking.email, {
        bookingId: booking.bookingId,
        orderNumber: booking.orderNumber,
        customerName: booking.customerName,
        serviceName: serviceData.name || serviceData.titleKey || 'AC Service',
        serviceIcon: serviceData.icon || '❄️',
        date: booking.date,
        time: booking.time,
        address: booking.address,
        totalAmount: booking.totalAmount,
        currency: booking.currency,
      });
    }

    console.log('✅ Admin confirmed booking via email:', bookingId);
    return res.send(adminPage(
      '✅ Booking Confirmed!',
      '#059669', '#F0FDF4',
      `Booking <strong>${escapeHtml(bookingId)}</strong> confirm ho gayi!<br><br>
       <strong>Customer:</strong> ${escapeHtml(booking.customerName)}<br>
       <strong>Phone:</strong> ${escapeHtml(booking.phone)}<br>
       <strong>Date:</strong> ${escapeHtml(booking.date)}<br>
       <strong>Time:</strong> ${escapeHtml(booking.time)}<br><br>
       Customer ko confirmation email bhej di gayi hai. ✉️`
    ));

  } catch (error) {
    console.error('❌ Admin confirm error:', error);
    return res.send(adminPage('❌ Server Error', '#EF4444', '#FEF2F2', 'Something went wrong. Please try again.'));
  }
});

// ============================================
// ✅ ADMIN CANCEL BOOKING - Email button se
// ============================================
router.post('/admin/cancel/:bookingId', async (req, res) => {
  try {
    const { token } = req.body;
    const { bookingId } = req.params;

    try {
      const decoded = jwt.verify(String(token || ''), JWT_SECRET, { algorithms: ['HS256'] });
      if (decoded.bookingId !== bookingId || decoded.action !== 'cancel') throw new Error('Wrong action');
    } catch (e) {
      return res.send(adminPage('❌ Link Expired!', '#EF4444', '#FEF2F2', 'Yeh cancel link expire ho gaya hai.'));
    }

    const booking = await Booking.findOne({ bookingId: String(bookingId) });
    if (!booking) return res.send(adminPage('❌ Booking Not Found', '#EF4444', '#FEF2F2', `Booking ID: ${escapeHtml(bookingId)} nahi mili.`));

    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.send(adminPage('⚠️ Cannot Cancel', '#F59E0B', '#FFFBEB', `Booking already ${escapeHtml(booking.status)} hai.`));
    }

    booking.status = 'cancelled';
    booking.cancellationReason = 'Cancelled by admin via email';
    booking.cancelledAt = new Date();
    booking.statusHistory.push({ status: 'cancelled', timestamp: new Date(), note: 'Cancelled by admin via email link' });
    await booking.save();

    console.log('✅ Admin cancelled booking via email:', bookingId);
    return res.send(adminPage(
      '❌ Booking Cancelled',
      '#DC2626', '#FEF2F2',
      `Booking <strong>${escapeHtml(bookingId)}</strong> cancel kar di gayi.<br><br>
       <strong>Customer:</strong> ${escapeHtml(booking.customerName)}<br>
       <strong>Phone:</strong> ${escapeHtml(booking.phone)}`
    ));

  } catch (error) {
    return res.send(adminPage('❌ Server Error', '#EF4444', '#FEF2F2', 'Something went wrong. Please try again.'));
  }
});

// ✅ Helper: Admin response page
const adminPage = (title, color, bg, message) => `
  <html>
  <body style="font-family:Arial,sans-serif;text-align:center;padding:60px;background:${bg};">
    <div style="max-width:500px;margin:auto;background:white;border-radius:16px;padding:40px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
      <h2 style="color:${color};margin-bottom:16px;">${title}</h2>
      <p style="color:#374151;font-size:15px;line-height:1.6;">${message}</p>
      <p style="color:#9CA3AF;font-size:12px;margin-top:24px;">Ahmed Cooling Admin System</p>
    </div>
  </body>
  </html>
`;

// ============================================
// PUBLIC REVIEWS — for HomeScreen
// ============================================
// Public reviews must not leak the customer's full name or address: first name + last initial, and a city only
// when it is one of the cities we serve.
const PUBLIC_CITIES = [
  { re: /jeddah|jedda\b/i, label: 'Jeddah' },
  { re: /جدة|جده/, label: 'جدة' },
  { re: /makkah|mecca|makka\b/i, label: 'Makkah' },
  { re: /مكة|مكه/, label: 'مكة' },
];
const publicCity = (address) => {
  const text = typeof address === 'string' ? address : '';
  return PUBLIC_CITIES.find((c) => c.re.test(text))?.label || '';
};
const publicName = (fullName) => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Customer';
  if (parts.length === 1) return parts[0].slice(0, 30);
  return `${parts[0].slice(0, 30)} ${Array.from(parts[parts.length - 1])[0]}.`;
};

router.get('/public/reviews', async (req, res) => {
  try {
    const bookings = await Booking.find({ 'customerFeedback.rating': { $exists: true, $gte: 1 }, 'customerFeedback.approved': true })
      .select('customerName customerFeedback createdAt address')
      .sort({ 'customerFeedback.date': -1 })
      .limit(10);
    const reviews = bookings.map(b => ({
      name: publicName(b.customerName),
      city: publicCity(b.address),
      rating: b.customerFeedback.rating,
      text: b.customerFeedback.comment || '',
      timeAgo: getTimeAgo(b.customerFeedback.date),
    }));
    res.json({ success: true, reviews });
  } catch (err) {
    console.error('❌ Public reviews error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ✅ ADMIN: Get all pending reviews
router.get('/admin/reviews', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
    const bookings = await Booking.find({ 'customerFeedback.rating': { $exists: true, $gte: 1 } })
      .select('customerName customerFeedback createdAt address bookingId service serviceDetails')
      .sort({ 'customerFeedback.date': -1 });
    const reviews = bookings.map(b => ({
      _id: b._id,
      bookingId: b.bookingId,
      customerName: b.customerName || 'Customer',
      serviceName: b.serviceDetails?.name || b.service?.name || 'Service',
      rating: b.customerFeedback.rating,
      comment: b.customerFeedback.comment || '',
      date: b.customerFeedback.date,
      approved: b.customerFeedback.approved || false,
    }));
    res.json({ success: true, reviews });
  } catch (err) {
    console.error('❌ Admin reviews list error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ✅ ADMIN: Approve/Reject review
router.put('/admin/reviews/:id/approve', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
    const { approved } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking || !booking.customerFeedback?.rating) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    booking.customerFeedback.approved = approved !== false;
    await booking.save();
    res.json({ success: true, message: approved !== false ? 'Review approved' : 'Review rejected' });
  } catch (err) {
    console.error('❌ Admin review approve error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

function getTimeAgo(date) {
  if (!date) return '';
  const m = Math.floor((Date.now() - new Date(date)) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

// ============================================
// SHARED HELPERS
// ============================================
const ACTIVE_STATUSES = ['pending', 'confirmed', 'assigned', 'on_the_way', 'in_progress'];
const ISSUE_TYPES = ['invalid_phone', 'invalid_address', 'incomplete_info', 'other'];

// Any route with an :id parameter gets a well-formed ObjectId, so a bad id is a clean 404 instead of a crash.
router.param('id', (req, res, next, id) => {
  if (/^[a-f\d]{24}$/i.test(id)) return next();
  return res.status(404).json({ success: false, message: 'Booking not found' });
});

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.BOOKING_RATE_LIMIT || 10),
  keyGenerator: (req) => `booking:${req.user?.id || 'anonymous'}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many bookings. Please try again later.' },
});

const paging = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
  return { page, limit, skip: (page - 1) * limit };
};

const validateSchedule = (date, time) => {
  if (!isFutureOrToday(date)) return 'Please choose a valid date (YYYY-MM-DD) that is not in the past';
  if (!isValidTime(time)) return 'Please choose a valid time';
  return null;
};

const emailServiceFields = (booking) => {
  const serviceData = booking.service && typeof booking.service === 'object' ? booking.service : {};
  return {
    serviceName: serviceData.name || serviceData.titleKey || booking.serviceDetails?.name || 'AC Service',
    serviceIcon: serviceData.icon || '❄️',
  };
};

// One implementation for both cancel routes.
const cancelForOwner = async (req, res, booking) => {
  if (!ownsBooking(booking, req.user)) return res.status(403).json({ success: false, message: 'Access denied' });
  if (!['pending', 'confirmed'].includes(booking.status)) {
    return res.status(400).json({ success: false, message: `Cannot cancel in ${booking.status} status` });
  }
  const reason = cleanStr(req.body.reason, 500) || 'Cancelled by customer';

  booking.status = 'cancelled';
  booking.cancellationReason = reason;
  booking.cancelledAt = new Date();
  booking.statusHistory.push({ status: 'cancelled', timestamp: new Date(), note: `Cancelled by ${req.user.role === 'admin' ? 'admin' : 'customer'}` });
  await booking.save();

  const service = emailServiceFields(booking);
  const bookingId = booking.bookingId || booking._id.toString();
  sendBookingCancellationEmail({
    bookingId, orderNumber: booking.orderNumber, customerName: booking.customerName,
    customerPhone: booking.phone, ...service, date: booking.date, time: booking.time, cancellationReason: reason,
  });
  if (booking.email) {
    sendCustomerCancellationEmail(booking.email, {
      bookingId, customerName: booking.customerName, ...service,
      date: booking.date, time: booking.time, cancellationReason: reason,
    });
  }
  if (booking.user) {
    await new Notification({ user: booking.user, type: 'booking', title: 'Booking Cancelled', message: `Your booking #${booking.orderNumber} has been cancelled.`, data: { bookingId: booking._id } }).save();
  }
  return res.json({ success: true, message: 'Booking cancelled', data: { bookingId, status: booking.status }, booking });
};

// One implementation for both reschedule routes.
const rescheduleForOwner = async (req, res, booking) => {
  if (!ownsBooking(booking, req.user)) return res.status(403).json({ success: false, message: 'Access denied' });
  if (!['pending', 'confirmed'].includes(booking.status)) {
    return res.status(400).json({ success: false, message: `Cannot reschedule in ${booking.status} status` });
  }
  const date = cleanStr(req.body.date || req.body.scheduledDate, 10);
  const time = cleanStr(req.body.time || req.body.scheduledTime, 20);
  const problem = validateSchedule(date, time);
  if (problem) return res.status(400).json({ success: false, message: problem });

  const previous = { date: booking.date, time: booking.time };
  booking.previousSchedule = previous;
  booking.rescheduledAt = new Date();
  booking.date = date;
  booking.time = time;
  booking.scheduledDate = new Date(`${date}T00:00:00Z`);
  booking.scheduledTime = time;
  booking.statusHistory.push({ status: booking.status, timestamp: new Date(), note: 'Rescheduled by customer' });
  await booking.save();
  return res.json({ success: true, message: 'Booking rescheduled', data: { bookingId: booking.bookingId || booking._id, date: booking.date, time: booking.time } });
};

// One implementation for both review routes (moderated: approved=false until an admin approves).
const saveFeedback = async (req, res, booking) => {
  if (!ownsBooking(booking, req.user)) return res.status(403).json({ success: false, message: 'Access denied' });
  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: 'Rating 1-5 required' });
  }
  if (booking.status !== 'completed') return res.status(400).json({ success: false, message: 'Only completed bookings can be reviewed' });
  if (booking.customerFeedback?.rating) return res.status(400).json({ success: false, message: 'Review already submitted' });

  // Atomic: only the request that finds no rating yet can write one, so a double submit cannot count twice.
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, 'customerFeedback.rating': { $exists: false } },
    { $set: { customerFeedback: {
      rating,
      comment: cleanStr(req.body.comment, 1000),
      name: cleanStr(req.body.name, 100) || booking.customerName || 'Customer',
      date: new Date(),
      approved: false,
    } } },
    { new: true }
  );
  if (!updated) return res.status(400).json({ success: false, message: 'Review already submitted' });

  // Technician average is only touched by the request that won the update above, in one atomic step.
  if (updated.technician) {
    await Technician.updateOne({ user: updated.technician }, [{ $set: {
      rating: { $round: [{ $divide: [
        { $add: [{ $multiply: [{ $ifNull: ['$rating', 0] }, { $ifNull: ['$totalRatings', 0] }] }, rating] },
        { $add: [{ $ifNull: ['$totalRatings', 0] }, 1] },
      ] }, 1] },
      totalRatings: { $add: [{ $ifNull: ['$totalRatings', 0] }, 1] },
    } }]);
  }
  return res.json({ success: true, message: 'Review submitted! Thank you.', booking: updated });
};

// ============================================
// CUSTOMER ROUTES (login required)
// ============================================

router.put('/public/cancel/:bookingId', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: String(req.params.bookingId) });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    return await cancelForOwner(req, res, booking);
  } catch (error) {
    console.error('❌ Booking public cancel error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/public/reschedule/:bookingId', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: String(req.params.bookingId) });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    return await rescheduleForOwner(req, res, booking);
  } catch (error) {
    console.error('❌ Booking public reschedule error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id/reschedule', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    return await rescheduleForOwner(req, res, booking);
  } catch (error) {
    console.error('❌ Booking reschedule error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

const createdResponse = (booking) => ({
  success: true,
  message: 'Booking created successfully',
  data: { booking, bookingId: booking.bookingId, isLinkedToUser: true },
});

router.post('/public', auth, createLimiter, [
  body('customerName').isString().trim().isLength({ min: 2, max: 100 }).withMessage('Name required'),
  body('phone').isString().trim().notEmpty().withMessage('Phone required').custom(phoneValidator),
  body('service').notEmpty().withMessage('Service required'),
  body('date').isString().withMessage('Date required'),
  body('time').isString().withMessage('Time required'),
  body('address').isString().trim().isLength({ min: 3, max: 300 }).withMessage('Address required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array(), message: errors.array()[0].msg });

    const customerName = cleanStr(req.body.customerName, 100);
    const phone = cleanStr(req.body.phone, 30);
    const address = cleanStr(req.body.address, 300);
    const comments = cleanStr(req.body.comments, 1000);
    const date = cleanStr(req.body.date, 10);
    const time = cleanStr(req.body.time, 20);
    const city = cleanStr(req.body.city, 100);
    const placeId = cleanStr(req.body.placeId, 200);
    const platform = ['web', 'android', 'ios'].includes(req.body.platform) ? req.body.platform : 'web';
    const language = ['en', 'ur', 'ar'].includes(req.body.language) ? req.body.language : 'en';

    const problem = validateSchedule(date, time);
    if (problem) return res.status(400).json({ success: false, message: problem });

    const rawKey = req.get('Idempotency-Key');
    const idempotencyKey = rawKey === undefined ? null : String(rawKey).trim();
    if (idempotencyKey !== null && !IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
      return res.status(400).json({ success: false, message: 'Idempotency-Key must be 8-100 characters: letters, digits, _ or -' });
    }

    const lat = Number(req.body.coordinates?.latitude);
    const lng = Number(req.body.coordinates?.longitude);
    const coordinates = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { latitude: lat, longitude: lng }
      : { latitude: 0, longitude: 0 };

    const { country: detectedCountry, currency: detectedCurrency } = countryFromPhone(phone);

    const authenticatedUser = await User.findById(req.user.id);
    if (!authenticatedUser || authenticatedUser.role !== 'customer') return res.status(403).json({ success: false, message: 'Customer account required' });

    const service = req.body.service;
    const requestedServiceId = String(service && typeof service === 'object' ? (service.id || service._id || '') : service);
    const serviceRecord = /^[a-f\d]{24}$/i.test(requestedServiceId)
      ? await Service.findOne({ _id: requestedServiceId, active: true })
      : catalogueServices.find((item) => item.id === requestedServiceId);
    if (!serviceRecord) return res.status(404).json({ success: false, message: 'Service unavailable' });

    // A retry carrying the same Idempotency-Key gets the booking it already created (no second booking, no second email).
    if (idempotencyKey) {
      const existing = await Booking.findOne({ user: authenticatedUser._id, idempotencyKey });
      if (existing) return res.status(201).json(createdResponse(existing));
    }

    // Same customer, same service, same slot, still open -> almost certainly a double click.
    const duplicate = await Booking.findOne({
      user: authenticatedUser._id, date, time, 'service.id': serviceRecord._id, status: { $in: ACTIVE_STATUSES },
    });
    if (duplicate) return res.status(409).json({ success: false, message: 'You already have this service booked for that time' });

    const bookingId   = `BK${crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`;
    const orderNumber = `ORD-${new Date().toISOString().split('T')[0].replace(/-/g,'')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const servicePrice  = serviceRecord.basePrice;
    const visitCharges  = VISIT_CHARGE;
    const totalAmount   = servicePrice + visitCharges;

    const booking = await Booking.create({
      bookingId, orderNumber,
      user: authenticatedUser._id,
      customerName,
      phone,
      email: authenticatedUser.email || '',
      service: { id: serviceRecord._id, name: serviceRecord.name, name_ar: serviceRecord.nameAr, icon: serviceRecord.icon, basePrice: servicePrice, category: serviceRecord.category },
      date, time,
      address,
      country: detectedCountry,
      city,
      currency: detectedCurrency,
      comments,
      coordinates,
      placeId,
      platform,
      language,
      status: 'pending',
      servicePrice, visitCharges, totalAmount,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      statusHistory: [{ status: 'pending', timestamp: new Date(), note: `User: ${authenticatedUser.fullName}` }],
    });

    const emailData = {
      bookingId, orderNumber, customerName,
      customerEmail: authenticatedUser.email || '',
      customerPhone: phone,
      country: detectedCountry, city, currency: detectedCurrency,
      serviceName: serviceRecord.name,
      serviceIcon: serviceRecord.icon || '❄️',
      date, time, address, comments,
      servicePrice, visitCharges, totalAmount,
    };
    if (authenticatedUser.email) sendBookingReceivedEmail(authenticatedUser.email, emailData);
    sendAdminNotificationEmail(emailData);

    res.status(201).json(createdResponse(booking));
  } catch (error) {
    // Two simultaneous requests with the same key: the loser gets the winner's booking.
    if (error?.code === 11000 && req.get('Idempotency-Key')) {
      try {
        const existing = await Booking.findOne({ user: req.user.id, idempotencyKey: String(req.get('Idempotency-Key')).trim() });
        if (existing) return res.status(201).json(createdResponse(existing));
      } catch { /* fall through to the generic error */ }
    }
    console.error('❌ Booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to create booking' });
  }
});

router.get('/public/:bookingId', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: String(req.params.bookingId) });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (!ownsBooking(booking, req.user)) return res.status(403).json({ success: false, message: 'Access denied' });
    res.json({ success: true, data: { booking } });
  } catch (error) {
    console.error('❌ Booking public booking lookup error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/phone/:phone', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const requested = phoneVariants(req.params.phone);
    const own = phoneVariants(user.phone || '');
    if (user.role !== 'admin' && !requested.some((p) => own.includes(p))) {
      return res.status(403).json({ success: false, message: 'You can only view your own bookings' });
    }
    const query = user.role === 'admin' ? { phone: { $in: requested } } : { phone: { $in: requested }, user: user._id };
    const bookings = await Booking.find(query).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, data: { bookings } });
  } catch (error) {
    console.error('❌ Booking phone bookings error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/user/my-bookings', auth, async (req, res) => {
  try {
    const { page, limit, skip } = paging(req.query);
    const query = { user: req.user.id };
    if (typeof req.query.status === 'string' && ['pending', 'confirmed', 'assigned', 'on_the_way', 'in_progress', 'completed', 'cancelled'].includes(req.query.status)) {
      query.status = req.query.status;
    }
    const bookings = await Booking.find(query)
      .populate('technician', 'fullName phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const total = await Booking.countDocuments(query);
    res.json({ success: true, bookings, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('❌ Booking my bookings error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('technician', 'fullName phone').populate('user', 'fullName email phone');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    const isOwner = !!booking.user && String(booking.user._id || booking.user) === String(req.user.id);
    if (!isOwner && req.user.role !== 'admin' && !isAssignedTechnician(booking, req.user)) return res.status(403).json({ success: false, message: 'Access denied' });
    res.json({ success: true, booking });
  } catch (error) {
    console.error('❌ Booking booking lookup error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id/cancel', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    return await cancelForOwner(req, res, booking);
  } catch (error) {
    console.error('❌ Booking cancel error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/:id/feedback', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    return await saveFeedback(req, res, booking);
  } catch (error) {
    console.error('❌ Booking feedback error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/public/:bookingId/review', auth, async (req, res) => {
  try {
    const idParam = cleanStr(String(req.params.bookingId || ''), 60);
    const isObjectId = /^[a-f\d]{24}$/i.test(idParam);
    const booking = await Booking.findOne({
      $or: [
        ...(isObjectId ? [{ _id: idParam }] : []),
        { bookingId: idParam },
        { orderNumber: idParam },
        { orderNumber: idParam.replace(/^#/, '') },
      ],
    });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    return await saveFeedback(req, res, booking);
  } catch (error) {
    console.error('❌ Booking public review error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/:id/track', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (!ownsBooking(booking, req.user) && !isAssignedTechnician(booking, req.user)) return res.status(403).json({ success: false, message: 'Access denied' });

    let location = null;
    if (booking.technician) {
      const tech = await Technician.findOne({ user: booking.technician });
      if (tech?.currentLocation) location = { coordinates: tech.currentLocation.coordinates, lastUpdated: tech.currentLocation.lastUpdated };
    }
    res.json({ success: true, location, status: booking.status, estimatedArrival: booking.status === 'on_the_way' ? '15-20 minutes' : null });
  } catch (error) {
    console.error('❌ Booking track error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================
// STAFF ROUTES (admin / technician)
// ============================================
// Forward-only. "assigned" is reached through PUT /:id/assign (it needs a technician), not through this table.
const VALID_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'completed', 'cancelled'],
  assigned: ['on_the_way', 'in_progress', 'completed', 'cancelled'],
  on_the_way: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
};

router.put('/:id/status', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'technician') return res.status(403).json({ success: false, message: 'Access denied' });
    const status = req.body.status;
    const notes = cleanStr(req.body.notes, 500);
    if (typeof status !== 'string') return res.status(400).json({ success: false, message: 'Status required' });
    if (status === 'assigned') return res.status(400).json({ success: false, message: 'Use the assign option to pick a technician' });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (req.user.role === 'technician' && String(booking.technician || '') !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not assigned to this booking' });
    }
    if (!VALID_TRANSITIONS[booking.status]?.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid transition: ${booking.status} → ${status}` });
    }

    booking.status = status;
    booking.statusHistory.push({ status, timestamp: new Date(), note: notes || `Updated by ${req.user.role}` });
    if (notes) booking.technicianNotes = notes;
    if (status === 'cancelled') { booking.cancelledAt = new Date(); booking.cancellationReason = notes || 'Cancelled by staff'; }
    await booking.save();

    if (status === 'completed' && booking.technician) {
      await Technician.updateOne({ user: booking.technician }, { $inc: { completedJobs: 1 } });
    }

    if (status === 'confirmed' && booking.email) {
      sendBookingConfirmedEmail(booking.email, {
        bookingId: booking.bookingId, orderNumber: booking.orderNumber,
        customerName: booking.customerName, ...emailServiceFields(booking),
        date: booking.date, time: booking.time,
        address: booking.address, totalAmount: booking.totalAmount, currency: booking.currency,
      });
    }
    if (status === 'cancelled' && booking.email) {
      sendCustomerCancellationEmail(booking.email, {
        bookingId: booking.bookingId || booking._id.toString(), customerName: booking.customerName,
        ...emailServiceFields(booking), date: booking.date, time: booking.time,
        cancellationReason: booking.cancellationReason,
      });
    }

    if (booking.user) await new Notification({ user: booking.user, type: 'booking', title: `Booking ${status}`, message: `Your booking #${booking.orderNumber} is now ${status}.`, data: { bookingId: booking._id, status } }).save();

    res.json({ success: true, message: `Status updated to ${status}`, booking });
  } catch (error) {
    console.error('❌ Booking status update error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin picks the technician for a booking (this is the only way a booking becomes "assigned").
router.put('/:id/assign', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
    const technicianId = String(req.body.technicianId || '');
    if (!/^[a-f\d]{24}$/i.test(technicianId)) return res.status(400).json({ success: false, message: 'Valid technicianId required' });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (!['pending', 'confirmed', 'assigned'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: `Cannot assign a technician in ${booking.status} status` });
    }
    const technician = await User.findOne({ _id: technicianId, role: 'technician' });
    if (!technician) return res.status(404).json({ success: false, message: 'Technician not found' });

    booking.technician = technician._id;
    booking.status = 'assigned';
    booking.statusHistory.push({ status: 'assigned', timestamp: new Date(), note: `Assigned to ${technician.fullName}` });
    await booking.save();

    if (booking.user) await new Notification({ user: booking.user, type: 'booking', title: 'Technician assigned', message: `A technician was assigned to booking #${booking.orderNumber}.`, data: { bookingId: booking._id } }).save();
    res.json({ success: true, message: 'Technician assigned', booking });
  } catch (error) {
    console.error('❌ Booking assign error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id/report-issue', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
    const issueType = req.body.issueType;
    const message = cleanStr(req.body.message, 1000);
    if (!ISSUE_TYPES.includes(issueType)) return res.status(400).json({ success: false, message: 'Issue type required' });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const issueMessages = {
      invalid_phone: 'Your phone number appears to be invalid. Please update it.',
      invalid_address: 'Your address is incomplete or invalid. Please provide a correct address.',
      incomplete_info: 'Your booking information is incomplete. Please update your details.',
      other: message || 'There is an issue with your booking. Please contact support.',
    };
    const issueLabels = {
      invalid_phone: 'Invalid Phone Number',
      invalid_address: 'Invalid Address',
      incomplete_info: 'Incomplete Information',
      other: 'Booking Issue',
    };

    booking.statusHistory.push({
      status: 'issue_reported',
      timestamp: new Date(),
      note: `Admin reported: ${issueLabels[issueType]}${message ? ' - ' + message : ''}`,
    });
    await booking.save();

    if (booking.user) {
      await new Notification({
        user: booking.user,
        type: 'alert',
        title: issueLabels[issueType],
        message: message || issueMessages[issueType],
        data: { bookingId: booking._id, orderNumber: booking.orderNumber, issueType },
        priority: 'high',
      }).save();
    }
    res.json({ success: true, message: 'Issue reported and user notified' });
  } catch (error) {
    console.error('❌ Booking report issue error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
