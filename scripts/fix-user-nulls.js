// One-time database cleanup.
//
// The User collection has UNIQUE + SPARSE indexes on phone, email and googleId. "Sparse" only skips
// documents where the field is MISSING — a field stored as null still counts, so a second Google
// sign-up (phone: null) could fail with a duplicate-key error. This script removes null values.
//
// Usage (from the project root, with MONGODB_URI in .env):
//   node scripts/fix-user-nulls.js           -> shows what would change, changes nothing
//   node scripts/fix-user-nulls.js --apply   -> removes the null fields
require('dotenv').config();
const mongoose = require('mongoose');

const FIELDS = ['phone', 'email', 'googleId'];

(async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI);
  const users = mongoose.connection.collection('users');

  for (const field of FIELDS) {
    const count = await users.countDocuments({ [field]: null, $expr: { $eq: [{ $type: `$${field}` }, 'null'] } });
    console.log(`${field}: ${count} user(s) have it stored as null`);
    if (apply && count > 0) {
      const result = await users.updateMany({ [field]: { $type: 'null' } }, { $unset: { [field]: '' } });
      console.log(`  -> cleaned ${result.modifiedCount}`);
    }
  }
  console.log('\nIndexes on users:');
  console.log((await users.indexes()).map((i) => `  ${i.name} ${JSON.stringify(i.key)} unique=${!!i.unique} sparse=${!!i.sparse}`).join('\n'));
  if (!apply) console.log('\nDry run only. Run again with --apply to make the change.');
  await mongoose.disconnect();
})().catch((err) => { console.error(err.message); process.exit(1); });
