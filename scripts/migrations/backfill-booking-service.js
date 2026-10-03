// (a) Bookings: service.id stored as a 24-hex STRING -> ObjectId, a bare service string id -> ObjectId,
//     and serviceDetails filled in where it is missing (from the embedded service, or the Service collection for
//     legacy bookings whose `service` is only an id).
//   node scripts/migrations/backfill-booking-service.js [--apply]
const mongoose = require('mongoose');
const { run, sample } = require('./_lib');

const HEX24 = /^[a-f\d]{24}$/i;
const { ObjectId } = mongoose.Types;

run('backfill-booking-service', async ({ db, apply }) => {
  const bookings = db.collection('bookings');
  const services = db.collection('services');
  const serviceCache = new Map();
  const loadService = async (id) => {
    const key = String(id);
    if (!serviceCache.has(key)) serviceCache.set(key, await services.findOne({ _id: new ObjectId(key) }));
    return serviceCache.get(key);
  };
  const detailsFromService = (s) => ({ name: s.name || 'AC Service', icon: s.icon || '❄️', price: s.basePrice || 0, category: s.category || 'general' });

  const cursor = bookings.find({}, { projection: { service: 1, serviceDetails: 1, orderNumber: 1 } });
  const ops = [];
  const changes = [];
  let unknownService = 0;
  for await (const b of cursor) {
    const $set = {};
    const svc = b.service;
    const hasDetails = !!(b.serviceDetails && b.serviceDetails.name);

    if (svc && typeof svc === 'object' && !(svc instanceof ObjectId) && svc._bsontype !== 'ObjectId') {
      // Embedded service object
      if (typeof svc.id === 'string' && HEX24.test(svc.id)) $set['service.id'] = new ObjectId(svc.id);
      if (!hasDetails) {
        $set.serviceDetails = { name: svc.titleKey || svc.name || 'AC Service', icon: svc.icon || '❄️', price: svc.basePrice || 0, category: svc.category || 'general' };
      }
    } else if (svc != null) {
      // Bare id (ObjectId or string)
      const idStr = String(svc);
      if (typeof svc === 'string' && HEX24.test(svc)) $set.service = new ObjectId(svc);
      if (!hasDetails && HEX24.test(idStr)) {
        const s = await loadService(idStr);
        if (s) $set.serviceDetails = detailsFromService(s);
        else unknownService += 1;
      }
    }

    if (Object.keys($set).length) {
      changes.push({ _id: String(b._id), orderNumber: b.orderNumber, set: Object.keys($set) });
      ops.push({ updateOne: { filter: { _id: b._id }, update: { $set } } });
    }
  }

  console.log(`Bookings to update: ${ops.length}`);
  console.log(`  service.id string -> ObjectId: ${changes.filter((c) => c.set.includes('service.id')).length}`);
  console.log(`  bare service string -> ObjectId: ${changes.filter((c) => c.set.includes('service')).length}`);
  console.log(`  serviceDetails filled: ${changes.filter((c) => c.set.includes('serviceDetails')).length}`);
  if (unknownService) console.log(`  (${unknownService} legacy booking(s) point at a service id that no longer exists — left as is)`);
  for (const c of sample(changes)) console.log('  e.g.', JSON.stringify(c));

  if (apply && ops.length) {
    const r = await bookings.bulkWrite(ops, { ordered: false });
    console.log(`Applied: ${r.modifiedCount} booking(s) modified`);
  }
});
