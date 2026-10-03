const Notification = require('../models/Notification');
const User = require('../models/User');

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const EXPO_URL = 'https://exp.host/--/api/v2/push/send';

let fcmApp; // undefined = not tried, null = unavailable
const getFcm = () => {
  if (fcmApp !== undefined) return fcmApp;
  fcmApp = null;
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) { console.log('[notify] FCM skipped: FIREBASE_SERVICE_ACCOUNT not set'); return fcmApp; }
    const admin = require('firebase-admin');
    const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    fcmApp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) }, 'notify');
  } catch (e) {
    console.log('[notify] FCM skipped:', e.code === 'MODULE_NOT_FOUND' ? 'firebase-admin not installed' : e.message);
  }
  return fcmApp;
};

const pruneTokens = async (userId, tokens) => {
  if (!tokens.length) return;
  try { await User.updateOne({ _id: userId }, { $pull: { pushTokens: { token: { $in: tokens } } } }); }
  catch (e) { console.log('[notify] token prune failed:', e.message); }
};

const sendExpo = async (userId, tokens, payload) => {
  const messages = tokens.map((to) => ({
    to, sound: 'default', title: payload.title, body: payload.message, data: payload.data, priority: payload.priority === 'high' ? 'high' : 'default'
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
  const app = getFcm();
  if (!app) return;
  const data = {};
  Object.entries(payload.data || {}).forEach(([k, v]) => { data[k] = String(v); });
  const r = await app.messaging().sendEachForMulticast({
    tokens, notification: { title: payload.title, body: payload.message }, data,
    android: { priority: payload.priority === 'high' ? 'high' : 'normal' }
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
const notifyUser = async (userId, { type = 'booking', title, message, titleAr, messageAr, data = {}, priority = 'medium' } = {}) => {
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
    sendPush(userId, { title, message, data: pushData, priority }).catch((e) => console.log('[notify] push error:', e.message));
    return doc;
  } catch (e) {
    console.log('[notify] failed:', e.message);
    return null;
  }
};

module.exports = { notifyUser };
