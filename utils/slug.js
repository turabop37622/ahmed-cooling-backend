// Service URL slugs. Server-side port of web/src/lib/serviceSlugs.js — the rules MUST stay identical:
//   "Stove & Oven Repair" -> "stove-oven-repair-jeddah"
// Bundled services (web/src/lib/services.json) keep their fixed slug, even when their name differs.
// A slug is stored on the Service once (on create, or by scripts/migrations/backfill-service-slugs.js) and is never
// changed by a rename, so published URLs keep working.
const catalogue = require('../web/src/lib/services.json');

const SLUG_SUFFIX = '-jeddah';
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(name) {
  const base = String(name ?? '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base ? `${base}${SLUG_SUFFIX}` : '';
}

const ID_TO_SLUG = {};
const SLUG_TO_ID = {};
for (const s of catalogue) {
  if (!s.slug) continue;
  ID_TO_SLUG[s._id] = s.slug;
  SLUG_TO_ID[s.slug] = s._id;
}
// Name-derived aliases the website still resolves to a bundled service (old URLs): never hand them to another service.
const ALIAS_TO_ID = {};
for (const s of catalogue) {
  const derived = slugify(s.name);
  if (s.slug && derived && derived !== s.slug && !SLUG_TO_ID[derived]) ALIAS_TO_ID[derived] = s._id;
}

const isSlug = (value) => typeof value === 'string' && SLUG_RE.test(value);
const fixedSlugForId = (id) => ID_TO_SLUG[String(id ?? '')] || null;

// The slug a service should get when one is stored for the first time: its fixed slug, else one from the English name.
const baseSlugFor = (service) => fixedSlugForId(service && service._id) || slugify(service && service.name) || '';

// Reserved by the bundled catalogue for a different service id.
const reservedForOther = (slug, id) => {
  const owner = SLUG_TO_ID[slug] || ALIAS_TO_ID[slug];
  return !!owner && owner !== String(id ?? '');
};

// First free slug: base, base-2, base-3 ... `isTaken(slug)` (may be async) reports slugs used by other services.
async function uniqueSlug(base, id, isTaken) {
  if (!base) return '';
  for (let n = 1; n < 1000; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (reservedForOther(candidate, id)) continue;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error(`No free slug for ${base}`);
}

// Slug for a service document, checked against the Service collection.
const slugForService = (Service, service) =>
  uniqueSlug(baseSlugFor(service), service._id, async (slug) => !!(await Service.exists({ slug, _id: { $ne: service._id } })));

module.exports = { SLUG_SUFFIX, slugify, isSlug, fixedSlugForId, baseSlugFor, reservedForOther, uniqueSlug, slugForService };
