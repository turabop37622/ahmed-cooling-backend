// Removes ALL bookings (owner's test data) from the database in MONGODB_URI (.env).
// Nothing is lost for good:
//   1. every booking is written to a JSON backup file in backups/
//   2. every booking is copied into the `bookings_archive` collection
//   3. only then are they removed from `bookings`
// Notifications that point at those bookings get the same treatment (`notifications_archive`).
//
// Dry run (default, changes nothing):  node scripts/remove-test-bookings.js
// Really do it:                        node scripts/remove-test-bookings.js --apply
// Undo (put everything back):          node scripts/remove-test-bookings.js --restore

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const MODE = process.argv.includes('--restore') ? 'restore' : process.argv.includes('--apply') ? 'apply' : 'dry-run';
const REASON = 'Owner test bookings removed before launch';

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set in .env');
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const db = client.db();
  const bookings = db.collection('bookings');
  const notifications = db.collection('notifications');
  const bookingsArchive = db.collection('bookings_archive');
  const notificationsArchive = db.collection('notifications_archive');
  console.log(`Database: ${db.databaseName}  |  mode: ${MODE}`);

  if (MODE === 'restore') {
    const archived = await bookingsArchive.find({ archiveReason: REASON }).toArray();
    const archivedNotes = await notificationsArchive.find({ archiveReason: REASON }).toArray();
    const strip = ({ archivedAt, archiveReason, ...doc }) => doc;
    for (const doc of archived) await bookings.replaceOne({ _id: doc._id }, strip(doc), { upsert: true });
    for (const doc of archivedNotes) await notifications.replaceOne({ _id: doc._id }, strip(doc), { upsert: true });
    await bookingsArchive.deleteMany({ archiveReason: REASON });
    await notificationsArchive.deleteMany({ archiveReason: REASON });
    console.log(`Restored ${archived.length} bookings and ${archivedNotes.length} notifications.`);
    await client.close();
    return;
  }

  const all = await bookings.find({}).toArray();
  const ids = all.map((b) => b._id);
  const idStrings = ids.map(String);
  const relatedNotes = await notifications.find({
    $or: [{ 'data.bookingId': { $in: ids } }, { 'data.bookingId': { $in: idStrings } }],
  }).toArray();

  const byStatus = all.reduce((acc, b) => ({ ...acc, [b.status || 'unknown']: (acc[b.status || 'unknown'] || 0) + 1 }), {});
  const dates = all.map((b) => b.createdAt).filter(Boolean).sort((a, b) => a - b);
  console.log(`Bookings found: ${all.length}`, byStatus);
  if (dates.length) console.log(`Created between ${dates[0].toISOString()} and ${dates[dates.length - 1].toISOString()}`);
  console.log(`Notifications linked to them: ${relatedNotes.length}`);

  if (MODE === 'dry-run') {
    console.log('\nDry run only — nothing changed. Run again with --apply to remove them.');
    await client.close();
    return;
  }
  if (!all.length) {
    console.log('Nothing to remove.');
    await client.close();
    return;
  }

  // 1. JSON backup on this computer
  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `bookings-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ bookings: all, notifications: relatedNotes }, null, 2));
  console.log(`Backup written: ${file}`);

  // 2. copy into the archive collections
  const stamp = { archivedAt: new Date(), archiveReason: REASON };
  await bookingsArchive.insertMany(all.map((b) => ({ ...b, ...stamp })), { ordered: false }).catch((e) => {
    if (e.code !== 11000) throw e; // already archived earlier: fine
  });
  if (relatedNotes.length) {
    await notificationsArchive.insertMany(relatedNotes.map((n) => ({ ...n, ...stamp })), { ordered: false }).catch((e) => {
      if (e.code !== 11000) throw e;
    });
  }
  const archivedCount = await bookingsArchive.countDocuments({ _id: { $in: ids } });
  if (archivedCount !== all.length) throw new Error(`Archive check failed (${archivedCount}/${all.length}) — nothing removed.`);

  // 3. remove from the live collections
  const removed = await bookings.deleteMany({ _id: { $in: ids } });
  const removedNotes = relatedNotes.length
    ? await notifications.deleteMany({ _id: { $in: relatedNotes.map((n) => n._id) } })
    : { deletedCount: 0 };
  console.log(`Removed ${removed.deletedCount} bookings and ${removedNotes.deletedCount} notifications.`);
  console.log(`Bookings left: ${await bookings.countDocuments()}`);
  console.log('To undo: node scripts/remove-test-bookings.js --restore');
  await client.close();
})().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
