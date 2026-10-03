// (c) Services: store a `slug` on every service that has none, with the SAME rules as the website
//     (web/src/lib/serviceSlugs.js via utils/slug.js): the fixed slug of a bundled service, else one from the
//     CURRENT English name; duplicates get -2, -3 ... in _id order. Then makes sure the unique sparse slug index exists.
//   node scripts/migrations/backfill-service-slugs.js [--apply]
const { run } = require('./_lib');
const { baseSlugFor, uniqueSlug, isSlug } = require('../../utils/slug');

run('backfill-service-slugs', async ({ db, apply }) => {
  const services = db.collection('services');
  const all = await services.find({}, { projection: { name: 1, slug: 1, active: 1 } }).sort({ _id: 1 }).toArray();
  const taken = new Set(all.filter((s) => isSlug(s.slug)).map((s) => s.slug));
  const invalid = all.filter((s) => s.slug != null && !isSlug(s.slug));
  const plan = [];
  for (const s of all) {
    if (isSlug(s.slug)) continue;
    const slug = await uniqueSlug(baseSlugFor(s), String(s._id), async (candidate) => taken.has(candidate));
    if (!slug) { console.log(`  ! ${s._id} "${s.name}" has no usable English name — skipped`); continue; }
    taken.add(slug);
    plan.push({ _id: s._id, name: s.name, slug, active: s.active });
  }
  console.log(`Services: ${all.length}, already with a slug: ${all.length - plan.length - invalid.length}, to set: ${plan.length}`);
  if (invalid.length) console.log(`  ! ${invalid.length} service(s) have an invalid slug value (will be replaced):`, invalid.map((s) => `${s._id}=${JSON.stringify(s.slug)}`).join(', '));
  for (const p of plan) console.log(`  ${p._id}  ${p.slug.padEnd(42)} <- "${p.name}"${p.active === false ? ' (inactive)' : ''}`);

  const indexes = await services.indexes();
  const slugIndex = indexes.find((i) => i.key && i.key.slug === 1);
  console.log(`Slug index: ${slugIndex ? `${slugIndex.name} unique=${!!slugIndex.unique} sparse=${!!slugIndex.sparse}` : 'missing (will be created: { slug: 1 } unique sparse)'}`);

  if (!apply) return;
  if (plan.length) {
    const r = await services.bulkWrite(plan.map((p) => ({ updateOne: { filter: { _id: p._id }, update: { $set: { slug: p.slug } } } })), { ordered: false });
    console.log(`Applied: ${r.modifiedCount} slug(s) stored`);
  }
  if (!slugIndex) {
    await services.createIndex({ slug: 1 }, { unique: true, sparse: true, name: 'slug_1' });
    console.log('Applied: created index slug_1 (unique, sparse)');
  }
});
