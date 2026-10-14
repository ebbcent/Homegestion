import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addMonths, endOfMonthAfter, isIsoDate, occurrences } from './dates.js';

test('addMonths clamps to the end of shorter months', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-11-15', 3), '2027-02-15');
  assert.equal(addMonths('2026-03-10', -3), '2025-12-10');
});

test('isIsoDate rejects impossible dates', () => {
  assert.ok(isIsoDate('2026-02-28'));
  assert.ok(!isIsoDate('2026-02-30'));
  assert.ok(!isIsoDate('2026-2-3'));
  assert.ok(!isIsoDate(null));
});

test('occurrences keep the anchor day after a short month', () => {
  assert.deepEqual(occurrences('2026-01-31', 'monthly', '2026-04-30'),
    ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
});

test('occurrences respect frequency and end date', () => {
  assert.deepEqual(occurrences('2026-01-05', 'quarterly', '2027-01-31'),
    ['2026-01-05', '2026-04-05', '2026-07-05', '2026-10-05', '2027-01-05']);
  assert.deepEqual(occurrences('2026-01-05', 'monthly', '2026-12-31', '2026-03-01'),
    ['2026-01-05', '2026-02-05']);
});

test('endOfMonthAfter', () => {
  assert.equal(endOfMonthAfter('2026-10-14', 1), '2026-11-30');
  assert.equal(endOfMonthAfter('2026-12-31', 1), '2027-01-31');
});
