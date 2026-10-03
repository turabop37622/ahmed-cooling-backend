// (f) Bookings: drop the duplicate / obsolete indexes and create the ones models/Booking.js declares now.
//   node scripts/migrations/booking-indexes.js [--apply]
// Dropped (duplicates or never queried): user_1 (covered by user_1_createdAt_-1), status_1 (covered by the status_*
// compounds), createdAt_1 (createdAt_-1 serves both directions), country_1, city_1.
const { run } = require('./_lib');
const Booking = require('../../models/Booking');

const OBSOLETE = ['user_1', 'status_1', 'createdAt_1', 'country_1', 'city_1'];
const nameOf = (key) => Object.entries(key).map(([k, v]) => `${k}_${v}`).join('_');

run('booking-indexes', async ({ db, apply }) => {
  const bookings = db.collection('bookings');
  const existing = await bookings.indexes();
  const existingNames = new Set(existing.map((i) => i.name));
  const wanted = Booking.schema.indexes().map(([key, options]) => ({ key, options, name: options.name || nameOf(key) }));

  const toDrop = OBSOLETE.filter((n) => existingNames.has(n));
  const toCreate = wanted.filter((w) => !existing.some((e) => JSON.stringify(e.key) === JSON.stringify(w.key)));
  const unknown = existing.filter((e) => e.name !== '_id_' && !OBSOLETE.includes(e.name) && !wanted.some((w) => JSON.stringify(w.key) === JSON.stringify(e.key)));

  console.log('Current indexes:', existing.map((i) => i.name).join(', '));
  console.log(`Drop (${toDrop.length}):`, toDrop.join(', ') || '-');
  console.log(`Create (${toCreate.length}):`, toCreate.map((w) => `${w.name}${w.options.unique ? ' (unique)' : ''}`).join(', ') || '-');
  if (unknown.length) console.log('Left alone (not in the schema, check by hand):', unknown.map((i) => i.name).join(', '));

  if (!apply) return;
  for (const name of toDrop) {
    await bookings.dropIndex(name);
    console.log(`Applied: dropped ${name}`);
  }
  for (const w of toCreate) {
    const { background, ...options } = w.options; // background is ignored by MongoDB 4.2+
    await bookings.createIndex(w.key, { ...options, name: w.name });
    console.log(`Applied: created ${w.name}`);
  }
  console.log('Indexes now:', (await bookings.indexes()).map((i) => i.name).join(', '));
});
