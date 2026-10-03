// (b) Bookings: Saudi Arabia / SAR only.
//   - Bookings with a Saudi phone (+966 / 05...) whose country/currency is missing or different -> 'Saudi Arabia' / 'SAR'.
//   - Legacy Pakistani test bookings (+92 phone, or PKR, or country Pakistan) are COPIED into `bookings_archive`
//     and then hidden in `bookings` with a soft delete (deletedAt + archivedAt + archiveReason). Nothing is deleted.
//   - Anything else that is not Saudi (e.g. Qatar) is only listed for a human decision.
//   node scripts/migrations/backfill-booking-country.js [--apply]
const { run, sample } = require('./_lib');

const digits = (p) => String(p || '').replace(/[^\d+]/g, '');
const isSaudiPhone = (p) => { const d = digits(p); return d.startsWith('+966') || d.startsWith('966') || /^05\d{8}$/.test(d); };
const isPakistaniPhone = (p) => { const d = digits(p); return d.startsWith('+92') || /^92\d{10}$/.test(d) || /^03\d{9}$/.test(d); };

run('backfill-booking-country', async ({ db, apply }) => {
  const bookings = db.collection('bookings');
  const archive = db.collection('bookings_archive');
  const all = await bookings.find({ archivedAt: { $exists: false } }, { projection: { phone: 1, country: 1, currency: 1, orderNumber: 1, status: 1, createdAt: 1, deletedAt: 1 } }).toArray();

  const toSaudi = [];
  const toArchive = [];
  const unclear = [];
  for (const b of all) {
    const pk = isPakistaniPhone(b.phone) || b.currency === 'PKR' || b.country === 'Pakistan';
    if (pk) { toArchive.push(b); continue; }
    if (isSaudiPhone(b.phone)) {
      if (b.country !== 'Saudi Arabia' || b.currency !== 'SAR') toSaudi.push(b);
      continue;
    }
    if (b.country !== 'Saudi Arabia' || b.currency !== 'SAR') unclear.push(b);
  }

  const brief = (b) => ({ _id: String(b._id), orderNumber: b.orderNumber, phone: b.phone, country: b.country, currency: b.currency, status: b.status });
  console.log(`Saudi-phone bookings to set to Saudi Arabia / SAR: ${toSaudi.length}`);
  for (const b of sample(toSaudi)) console.log('  ', JSON.stringify(brief(b)));
  console.log(`Legacy +92 / PKR bookings to archive (copy to bookings_archive + soft-delete): ${toArchive.length}`);
  for (const b of sample(toArchive, 50)) console.log('  ', JSON.stringify(brief(b)));
  console.log(`Other non-Saudi bookings (NOT changed, decide manually): ${unclear.length}`);
  for (const b of sample(unclear, 50)) console.log('  ', JSON.stringify(brief(b)));

  if (!apply) return;
  if (toSaudi.length) {
    const r = await bookings.updateMany({ _id: { $in: toSaudi.map((b) => b._id) } }, { $set: { country: 'Saudi Arabia', currency: 'SAR' } });
    console.log(`Applied: ${r.modifiedCount} booking(s) set to Saudi Arabia / SAR`);
  }
  if (toArchive.length) {
    const now = new Date();
    const ids = toArchive.map((b) => b._id);
    const full = await bookings.find({ _id: { $in: ids } }).toArray();
    // Upsert by _id so a re-run never duplicates the archive copy.
    await archive.bulkWrite(full.map((doc) => ({
      replaceOne: { filter: { _id: doc._id }, replacement: { ...doc, archivedAt: now, archiveReason: 'legacy-pkr-test-booking' }, upsert: true },
    })), { ordered: false });
    const r = await bookings.updateMany(
      { _id: { $in: ids } },
      { $set: { archivedAt: now, archiveReason: 'legacy-pkr-test-booking' }, $min: { deletedAt: now } }
    );
    console.log(`Applied: ${full.length} copied to bookings_archive, ${r.modifiedCount} hidden (soft-deleted) in bookings`);
  }
});
