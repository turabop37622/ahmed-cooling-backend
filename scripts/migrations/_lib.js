// Shared plumbing for the one-off data migrations in this folder.
//
// Every migration:
//   node scripts/migrations/<name>.js            -> DRY RUN (default): prints what would change, writes nothing
//   node scripts/migrations/<name>.js --apply    -> writes
// --apply is refused unless MONGODB_URI points at 127.0.0.1 / localhost, or CONFIRM_PRODUCTION=yes is set.
//
// MONGODB_URI comes from the environment (or the project .env through dotenv, which never overrides a variable
// that is already set). The target host is always printed first.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]', '::1'];

// Host part(s) of a mongodb:// or mongodb+srv:// URI, without credentials.
const hostsOf = (uri) => {
  const m = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/i.exec(String(uri || ''));
  return m ? m[1].split(',').map((h) => h.replace(/:\d+$/, '')) : [];
};
const redact = (uri) => String(uri || '').replace(/\/\/[^@/]*@/, '//***@');

const parseArgs = () => {
  const apply = process.argv.includes('--apply');
  return { apply, dryRun: !apply };
};

// Connects (refusing --apply on a non-local database without CONFIRM_PRODUCTION=yes) and returns { db, apply }.
async function start(name) {
  const { apply } = parseArgs();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }
  const hosts = hostsOf(uri);
  const local = hosts.length > 0 && hosts.every((h) => LOCAL_HOSTS.includes(h.toLowerCase()));
  console.log(`== ${name} ==`);
  console.log(`Target: ${redact(uri)}  (${local ? 'local' : 'REMOTE'})`);
  console.log(`Mode:   ${apply ? 'APPLY (writes)' : 'DRY RUN (no writes; pass --apply to write)'}`);
  if (apply && !local && process.env.CONFIRM_PRODUCTION !== 'yes') {
    console.error('Refusing --apply on a non-local database. Set CONFIRM_PRODUCTION=yes to run it there on purpose.');
    process.exit(2);
  }
  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 15000 });
  return { db: mongoose.connection.db, apply };
}

async function finish(code = 0) {
  await mongoose.disconnect();
  process.exit(code);
}

// Runs main() with connect / disconnect and a non-zero exit code on failure.
function run(name, main) {
  start(name)
    .then((ctx) => main(ctx))
    .then(() => finish(0))
    .catch(async (err) => {
      console.error(`${name} failed:`, err && err.stack ? err.stack : err);
      try { await mongoose.disconnect(); } catch { /* ignore */ }
      process.exit(1);
    });
}

const sample = (list, n = 10) => list.slice(0, n);

module.exports = { run, hostsOf, sample };
