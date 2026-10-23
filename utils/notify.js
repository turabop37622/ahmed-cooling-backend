const Notification = require('../models/Notification');
const User = require('../models/User');

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const EXPO_URL = 'https://exp.host/--/api/v2/push/send';

// FCM (firebase-admin) is used only when FIREBASE_SERVICE_ACCOUNT holds the service-account JSON, raw or base64.
// Without it FCM tokens are skipped silently (Expo tokens keep working).
let fcmMessaging; // undefined = not tried, null = unavailable
const getFcm = () => {
  if (fcmMessaging !== undefined) return fcmMessaging;
  fcmMessaging = null;
  try {
    const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (!raw) { console.log('[notify] FCM skipped: FIREBASE_SERVICE_ACCOUNT not set'); return fcmMessaging; }
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const app = getApps().find((a) => a.name === 'notify') || initializeApp({ credential: cert(JSON.parse(json)) }, 'notify');
    fcmMessaging = getMessaging(app);
  } catch (e) {
    console.log('[notify] FCM skipped:', e.code === 'MODULE_NOT_FOUND' ? 'firebase-admin not installed' : e.message);
  }
  return fcmMessaging;
};

const pruneTokens = async (userId, tokens) => {
  if (!tokens.length) return;
  try { await User.updateOne({ _id: userId }, { $pull: { pushTokens: { token: { $in: tokens } } } }); }
  catch (e) { console.log('[notify] token prune failed:', e.message); }
};

const sendExpo = async (userId, tokens, payload) => {
  const messages = tokens.map((to) => ({
    to, sound: 'default', title: payload.title, body: payload.message, data: payload.data, priority: payload.priority === 'high' ? 'high' : 'default',
    ...(payload.channelId ? { channelId: payload.channelId } : {})
  }));
  const res = await fetch(EXPO_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(8000)
  });
  const json = await res.json().catch(() => ({}));
  const tickets = Array.isArray(json.data) ? json.data : [];
  const bad = [];
  tickets.forEach((t, i) => { if (t && t.status === 'error' && t.details && t.details.error === 'DeviceNotRegistered') bad.push(tokens[i]); });
  await pruneTokens(userId, bad);
};

const sendFcm = async (userId, tokens, payload) => {
  const messaging = getFcm();
  if (!messaging) return;
  const data = {};
  Object.entries(payload.data || {}).forEach(([k, v]) => { if (v !== undefined && v !== null) data[k] = String(v); });
  const r = await messaging.sendEachForMulticast({
    tokens, notification: { title: payload.title, body: payload.message }, data,
    android: {
      priority: payload.priority === 'high' ? 'high' : 'normal',
      ...(payload.channelId ? { notification: { channelId: payload.channelId, sound: 'default' } } : {})
    }
  });
  const bad = [];
  r.responses.forEach((x, i) => {
    const c = x.error && x.error.code;
    if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token') bad.push(tokens[i]);
  });
  await pruneTokens(userId, bad);
};

const sendPush = async (userId, payload) => {
  const user = await User.findById(userId).select('pushTokens settings');
  if (!user || !user.pushTokens || !user.pushTokens.length) return;
  if (user.settings && user.settings.pushNotifications === false) return;
  const expo = user.pushTokens.filter((t) => t.kind === 'expo').map((t) => t.token);
  const fcm = user.pushTokens.filter((t) => t.kind === 'fcm').map((t) => t.token);
  const jobs = [];
  if (expo.length) jobs.push(sendExpo(userId, expo, payload).catch((e) => console.log('[notify] expo push failed:', e.message)));
  if (fcm.length) jobs.push(sendFcm(userId, fcm, payload).catch((e) => console.log('[notify] fcm push failed:', e.message)));
  await Promise.all(jobs);
};

/**
 * Save an in-app notification and best-effort push it. Never throws.
 * Returns the saved Notification doc (or null).
 */
const notifyUser = async (userId, { type = 'booking', title, message, titleAr, messageAr, data = {}, priority = 'medium', channelId } = {}) => {
  try {
    if (!userId || !title || !message) return null;
    const payloadData = { ...data };
    if (titleAr) payloadData.titleAr = titleAr;
    if (messageAr) payloadData.messageAr = messageAr;
    const doc = await new Notification({
      user: userId, type, title, message, data: payloadData, priority,
      expiresAt: new Date(Date.now() + NINETY_DAYS_MS)
    }).save();
    const pushData = { ...payloadData, notificationId: String(doc._id) };
    // Fire and forget: push must never delay or break the request.
    sendPush(userId, { title, message, data: pushData, priority, channelId }).catch((e) => console.log('[notify] push error:', e.message));
    return doc;
  } catch (e) {
    console.log('[notify] failed:', e.message);
    return null;
  }
};

// ── Technician job pushes (mobile app, Android channel 'bookings') ──
// data: { kind: 'job', bookingId, event: 'assigned' | 'reassigned' | 'cancelled' | 'rescheduled', orderNumber }
// 'reassigned' = the job was taken away from this technician (given to someone else or unassigned).
const jobServiceNames = (booking) => {
  const svc = booking.service && typeof booking.service === 'object' ? booking.service : {};
  const en = svc.name || booking.serviceDetails?.name || 'Service';
  return { en, ar: svc.name_ar || svc.nameAr || en };
};
const jobArea = (booking) => {
  const city = String(booking.city || '').trim();
  if (city) return city.slice(0, 40);
  const first = String(booking.address || '').split(',')[0].trim();
  return first.slice(0, 40);
};
const JOB_TEXT = {
  assigned: (b, s, when, area) => ({
    title: 'New job', titleAr: 'مهمة جديدة',
    message: ['New job: ' + s.en, when.en, area].filter(Boolean).join(' · '),
    messageAr: ['مهمة جديدة: ' + s.ar, when.ar, area].filter(Boolean).join(' · '),
  }),
  reassigned: (b) => ({
    title: 'Job removed', titleAr: 'تم سحب المهمة',
    message: `Booking #${b.orderNumber} is no longer assigned to you.`,
    messageAr: `الحجز رقم ${b.orderNumber} لم يعد مسنداً إليك.`,
  }),
  cancelled: (b, s, when) => ({
    title: 'Job cancelled', titleAr: 'تم إلغاء المهمة',
    message: `Booking #${b.orderNumber} (${s.en}${when.en ? ', ' + when.en : ''}) was cancelled.`,
    messageAr: `تم إلغاء الحجز رقم ${b.orderNumber} (${s.ar}${when.ar ? '، ' + when.ar : ''}).`,
  }),
  rescheduled: (b, s, when) => ({
    title: 'Job rescheduled', titleAr: 'تم تغيير موعد المهمة',
    message: `Booking #${b.orderNumber} (${s.en}) is now on ${when.en || 'a new date'}.`,
    messageAr: `الحجز رقم ${b.orderNumber} (${s.ar}) أصبح بتاريخ ${when.ar || 'موعد جديد'}.`,
  }),
  // Dispatch (utils/dispatch.js): a booking offered to this technician, first to accept wins.
  offer: (b, s, when, area) => ({
    title: 'New job offer', titleAr: 'عرض مهمة جديدة',
    message: ['Job offer: ' + s.en, when.en, area].filter(Boolean).join(' · ') + ' — open the app to accept.',
    messageAr: ['عرض مهمة: ' + s.ar, when.ar, area].filter(Boolean).join(' · ') + ' — افتح التطبيق للقبول.',
  }),
  late_offer: (b, s, when, area) => ({
    title: 'Late job available', titleAr: 'مهمة متأخرة متاحة',
    message: ['Late job: ' + s.en, when.en, area].filter(Boolean).join(' · ') + ' — pick it up if you can.',
    messageAr: ['مهمة متأخرة: ' + s.ar, when.ar, area].filter(Boolean).join(' · ') + ' — خذها إن استطعت.',
  }),
  late: (b) => ({
    title: 'You are late', titleAr: 'أنت متأخر',
    message: `Booking #${b.orderNumber} is overdue. Contact the customer now — it may be given to another technician.`,
    messageAr: `الحجز رقم ${b.orderNumber} متأخر. تواصل مع العميل الآن — قد يُسند لفني آخر.`,
  }),
};
const notifyTechnicianJob = (technicianId, booking, event) => {
  const make = JOB_TEXT[event];
  if (!technicianId || !booking || !make) return Promise.resolve(null);
  const when = booking.date
    ? { en: booking.date + (booking.time ? ' ' + booking.time : ''), ar: booking.date + (booking.time ? ' ' + booking.time : '') }
    : { en: 'Flexible', ar: 'موعد مرن' };
  const text = make(booking, jobServiceNames(booking), when, jobArea(booking));
  return notifyUser(technicianId, {
    type: 'booking', ...text, priority: 'high', channelId: 'bookings',
    data: { kind: 'job', bookingId: String(booking._id), event, orderNumber: booking.orderNumber, status: booking.status },
  });
};

module.exports = { notifyUser, notifyTechnicianJob };
