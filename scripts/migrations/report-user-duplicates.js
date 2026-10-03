// (e) Users: REPORT ONLY (never writes, even with --apply).
//   - accounts that share the same phone number once normalised (+966 5..., 9665..., 05...) or the same email
//     ignoring case — these must be merged/fixed by a person, there is no automatic merge;
//   - phone/email/googleId values stored as null (they break the sparse unique indexes);
//   - the current user indexes and the exact steps to rebuild email/phone as sparse unique indexes.
//   node scripts/migrations/report-user-duplicates.js
const { run } = require('./_lib');

// Saudi numbers in every spelling collapse to +9665XXXXXXXX; anything else keeps its digits.
const canonicalPhone = (p) => {
  const d = String(p || '').replace(/[^\d+]/g, '');
  if (!d) return '';
  if (/^\+9665\d{8}$/.test(d)) return d;
  if (/^9665\d{8}$/.test(d)) return `+${d}`;
  if (/^05\d{8}$/.test(d)) return `+966${d.slice(1)}`;
  if (/^5\d{8}$/.test(d)) return `+966${d}`;
  return d.startsWith('+') ? d : `+${d}`;
};

run('report-user-duplicates', async ({ db }) => {
  const users = db.collection('users');
  const all = await users.find({}, { projection: { fullName: 1, email: 1, phone: 1, role: 1, authProvider: 1, createdAt: 1 } }).toArray();
  const group = (keyOf) => {
    const map = new Map();
    for (const u of all) { const k = keyOf(u); if (!k) continue; if (!map.has(k)) map.set(k, []); map.get(k).push(u); }
    return [...map.entries()].filter(([, list]) => list.length > 1);
  };
  const show = (u) => `${u._id} role=${u.role} provider=${u.authProvider || '-'} phone=${JSON.stringify(u.phone)} email=${JSON.stringify(u.email)} created=${u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : '-'}`;

  const phoneDupes = group((u) => canonicalPhone(u.phone));
  const emailDupes = group((u) => (typeof u.email === 'string' ? u.email.trim().toLowerCase() : ''));
  console.log(`Users: ${all.length}`);
  console.log(`Duplicate phones (same number in different spellings): ${phoneDupes.length}`);
  for (const [k, list] of phoneDupes) { console.log(`  ${k}`); list.forEach((u) => console.log(`    - ${show(u)}`)); }
  console.log(`Duplicate emails (ignoring case/spaces): ${emailDupes.length}`);
  for (const [k, list] of emailDupes) { console.log(`  ${k}`); list.forEach((u) => console.log(`    - ${show(u)}`)); }
  const nonCanonical = all.filter((u) => u.phone && canonicalPhone(u.phone) !== u.phone);
  console.log(`Phones not stored in +966 form: ${nonCanonical.length}`);
  nonCanonical.slice(0, 20).forEach((u) => console.log(`    - ${show(u)}`));
  for (const f of ['phone', 'email', 'googleId']) {
    const n = await users.countDocuments({ [f]: { $type: 'null' } });
    console.log(`${f} stored as null: ${n}`);
  }
  const idx = await users.indexes();
  console.log('Current user indexes:');
  idx.forEach((i) => console.log(`  ${i.name} ${JSON.stringify(i.key)} unique=${!!i.unique} sparse=${!!i.sparse}${i.partialFilterExpression ? ` partial=${JSON.stringify(i.partialFilterExpression)}` : ''}`));

  console.log(`
PLAN (run by hand after a backup; nothing here is automatic):
  1. Resolve every duplicate listed above (keep one account per person; move bookings with
     db.bookings.updateMany({ user: <oldId> }, { $set: { user: <keptId> } }) and delete or disable the extra account).
  2. Remove null values that break sparse indexes:   node scripts/fix-user-nulls.js --apply
  3. Normalise phones to +9665XXXXXXXX for the accounts listed under "not stored in +966 form" (only after step 1,
     otherwise the unique index rejects the update).
  4. Rebuild the indexes (mongosh, in this order, during a quiet moment):
       db.users.dropIndex('email_1');  db.users.createIndex({ email: 1 }, { unique: true, sparse: true, name: 'email_1' })
       db.users.dropIndex('phone_1');  db.users.createIndex({ phone: 1 }, { unique: true, sparse: true, name: 'phone_1' })
     (skip a pair if the index above already shows unique=true sparse=true). createIndex fails if duplicates remain —
     then go back to step 1.`);
});
