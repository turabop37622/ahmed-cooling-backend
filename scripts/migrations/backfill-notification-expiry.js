// (d) Notifications: every notification gets an `expiresAt` (90 days after it was created), so the TTL index
//     cleans them up like the new ones. Old notifications whose 90 days are already over get a 7-day grace period
//     instead of vanishing the moment this runs (the TTL monitor would otherwise delete them within a minute).
//   node scripts/migrations/backfill-notification-expiry.js [--apply]
const { run } = require('./_lib');

const DAY = 24 * 60 * 60 * 1000;
const NINETY_DAYS = 90 * DAY;
const GRACE = 7 * DAY;

run('backfill-notification-expiry', async ({ db, apply }) => {
  const notifications = db.collection('notifications');
  const missing = await notifications.find({ $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }] }, { projection: { createdAt: 1 } }).toArray();
  const now = Date.now();
  let graced = 0;
  const ops = missing.map((n) => {
    const created = n.createdAt ? new Date(n.createdAt).getTime() : (n._id.getTimestamp ? n._id.getTimestamp().getTime() : now);
    let expires = created + NINETY_DAYS;
    if (expires < now + GRACE) { expires = now + GRACE; graced += 1; }
    return { updateOne: { filter: { _id: n._id }, update: { $set: { expiresAt: new Date(expires) } } } };
  });
  console.log(`Notifications without expiresAt: ${missing.length}`);
  console.log(`  of which older than 90 days (will expire in 7 days): ${graced}`);
  const ttl = (await notifications.indexes()).find((i) => i.key && i.key.expiresAt === 1);
  console.log(`TTL index: ${ttl ? `${ttl.name} expireAfterSeconds=${ttl.expireAfterSeconds}` : 'missing (will be created)'}`);

  if (!apply) return;
  if (ops.length) {
    const r = await notifications.bulkWrite(ops, { ordered: false });
    console.log(`Applied: ${r.modifiedCount} notification(s) updated`);
  }
  if (!ttl) {
    await notifications.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'expiresAt_1' });
    console.log('Applied: created TTL index expiresAt_1');
  }
});
