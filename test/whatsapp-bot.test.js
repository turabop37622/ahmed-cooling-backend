require('./helpers/quiet');
const test = require('node:test');
const assert = require('node:assert/strict');
const flow = require('../utils/whatsappBookingFlow');
const faq = require('../utils/whatsappFaq');
const catalogue = require('../web/src/lib/services.json');

test('every service can be booked from WhatsApp: groups cover the catalogue and a list never exceeds 10 rows', () => {
  const reachable = new Set();
  for (const group of flow.SERVICE_GROUPS) {
    const rows = flow.groupServices(group);
    assert.ok(rows.length > 0 && rows.length <= 10, `${group.key} has ${rows.length} rows`);
    for (const { index } of rows) reachable.add(index);
  }
  assert.equal(flow.SERVICE_GROUPS.length <= 10, true);
  assert.equal(reachable.size, catalogue.length);
});

test('a tap or an on-topic word answers the open question; a greeting or a sentence about something else does not', () => {
  assert.equal(flow.looksLikeAnswer('service', 'cat_ac'), true);
  assert.equal(flow.looksLikeAnswer('service', 'svc_3'), true);
  assert.equal(flow.looksLikeAnswer('date', 'tomorrow'), true);
  assert.equal(flow.looksLikeAnswer('date', '15/11'), true);
  assert.equal(flow.looksLikeAnswer('time', 'evening'), true);
  assert.equal(flow.looksLikeAnswer('confirm', 'yes'), true);
  assert.equal(flow.looksLikeAnswer('date', 'hello'), false);
  assert.equal(flow.looksLikeAnswer('time', 'how much is a gas refill'), false);
  assert.equal(flow.looksLikeAnswer('address', ''), false);
});

test('Roman Urdu is detected only with two Urdu words and no Arabic script', () => {
  assert.equal(faq.isRomanUrdu('meri fridge cooling nahi kar rahi'), true);
  assert.equal(faq.isRomanUrdu('fridge repair'), false);
  assert.equal(faq.isRomanUrdu('ثلاجتي لا تبرد'), false);
});

test('problem descriptions are recognised so they reach the AI instead of the price card', () => {
  assert.ok(faq.PROBLEM_RE.test('my fridge is not cooling'));
  assert.ok(!faq.PROBLEM_RE.test('AC repair'));
});
