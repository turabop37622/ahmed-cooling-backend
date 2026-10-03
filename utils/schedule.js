// Booking schedule helpers: the business works in Saudi Arabia, so "today" is always the date in Asia/Riyadh,
// whatever timezone the server (Render = UTC) or the customer's phone is in.
// Asia/Riyadh is UTC+3 all year (Saudi Arabia has no daylight saving time).
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const MAX_DAYS_AHEAD = 60; // same window as the website's booking calendar (web/src/app/book/[id]/page.js)
const DAY_MS = 24 * 60 * 60 * 1000;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 'YYYY-MM-DD' in Riyadh for the given instant (default: now).
const riyadhDate = (at = new Date()) => new Date(at.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);

// 'YYYYMMDD' in Riyadh, used in order numbers.
const riyadhCompactDate = (at = new Date()) => riyadhDate(at).replace(/-/g, '');

const isIsoDate = (value) => {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const addDays = (isoDate, days) => new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);

// A real calendar date from today (Riyadh) up to MAX_DAYS_AHEAD days ahead.
const isBookableDate = (value, { now = new Date(), maxDaysAhead = MAX_DAYS_AHEAD } = {}) => {
  if (!isIsoDate(value)) return false;
  const today = riyadhDate(now);
  return value >= today && value <= addDays(today, maxDaysAhead);
};

const pad2 = (n) => String(n).padStart(2, '0');

// One spelling for every time slot: '10:00AM', '10:00 am', '10:00 a.m.' -> '10:00 AM'; '9:30 pm' -> '09:30 PM';
// 24-hour '14:00' -> '02:00 PM'; 'anytime' -> 'Anytime'. Returns null for anything that is not a real time.
const normalizeTime = (value) => {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (/^anytime$/i.test(s)) return 'Anytime';
  let m = /^(\d{1,2}):([0-5]\d)\s*([ap])\.?\s*m\.?$/i.exec(s);
  if (m) {
    const h = Number(m[1]);
    if (h < 1 || h > 12) return null;
    return `${pad2(h)}:${m[2]} ${m[3].toUpperCase()}M`;
  }
  m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (m) {
    const h = Number(m[1]);
    return `${pad2(h % 12 || 12)}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
  }
  return null;
};

// Regex that matches every legacy spelling of a normalised slot, so the duplicate check also finds bookings that
// were stored before times were normalised ('10:00AM', '10:00 am', '10:00').
const timeMatcher = (normalized) => {
  if (normalized === 'Anytime') return /^\s*anytime\s*$/i;
  const m = /^(\d{2}):(\d{2}) ([AP])M$/.exec(String(normalized || ''));
  if (!m) return null;
  const h12 = Number(m[1]);
  const h24 = (h12 % 12) + (m[3] === 'P' ? 12 : 0);
  return new RegExp(`^\\s*(?:0?${h12}:${m[2]}\\s*${m[3]}\\.?\\s*m\\.?|0?${h24}:${m[2]})\\s*$`, 'i');
};

module.exports = { RIYADH_OFFSET_MS, MAX_DAYS_AHEAD, riyadhDate, riyadhCompactDate, isIsoDate, addDays, isBookableDate, normalizeTime, timeMatcher };
