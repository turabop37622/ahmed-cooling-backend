const test = require('node:test');
const assert = require('node:assert/strict');
const { riyadhDate, isBookableDate, normalizeTime, timeMatcher } = require('../utils/schedule');
const { isFutureOrToday } = require('../utils/security');

test('"today" is the Riyadh date (UTC+3), not the server date', () => {
  const lateUtc = new Date('2026-03-10T22:30:00Z'); // already 11 March in Riyadh
  assert.equal(riyadhDate(lateUtc), '2026-03-11');
  assert.equal(isBookableDate('2026-03-10', { now: lateUtc }), false, 'yesterday in Riyadh');
  assert.equal(isBookableDate('2026-03-11', { now: lateUtc }), true);
  assert.equal(isBookableDate('2026-05-10', { now: lateUtc }), true, '60 days ahead');
  assert.equal(isBookableDate('2026-05-11', { now: lateUtc }), false, '61 days ahead');
  assert.equal(isBookableDate('2026-02-30', { now: lateUtc }), false);
  const yesterday = riyadhDate(new Date(Date.now() - 86400000));
  assert.equal(isFutureOrToday(yesterday), false);
  assert.equal(isFutureOrToday(riyadhDate()), true);
});

test('time slots are normalised to one spelling', () => {
  const cases = {
    '10:00AM': '10:00 AM', '10:00 am': '10:00 AM', '10:00 a.m.': '10:00 AM', '9:30 pm': '09:30 PM', '12:00 PM': '12:00 PM',
    '14:00': '02:00 PM', '00:15': '12:15 AM', anytime: 'Anytime', ' Anytime ': 'Anytime',
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(normalizeTime(input), expected, input);
  for (const bad of ['13:00 PM', '0:00 AM', '25:00', '10:60', 'soon', '', null, 5]) assert.equal(normalizeTime(bad), null, String(bad));
});

test('timeMatcher finds legacy spellings of the same slot only', () => {
  const re = timeMatcher('02:00 PM');
  for (const s of ['02:00 PM', '2:00pm', '2:00 p.m.', '14:00']) assert.ok(re.test(s), s);
  for (const s of ['02:00 AM', '2:30 PM', '12:00 PM']) assert.ok(!re.test(s), s);
  assert.ok(timeMatcher('Anytime').test('anytime'));
});
