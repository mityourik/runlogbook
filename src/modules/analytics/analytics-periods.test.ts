import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveAnalyticsPeriod } from './analytics-periods.js';

describe('resolveAnalyticsPeriod', () => {
  const today = new Date('2026-05-15T12:00:00.000Z');

  it('resolves this_week to the Monday-Sunday UTC week', () => {
    assert.deepEqual(resolveAnalyticsPeriod({ period: 'this_week' }, today), {
      period: 'this_week',
      startDate: '2026-05-11',
      endDate: '2026-05-17'
    });
  });

  it('resolves last_7_days as a rolling window including today', () => {
    assert.deepEqual(resolveAnalyticsPeriod({ period: 'last_7_days' }, today), {
      period: 'last_7_days',
      startDate: '2026-05-09',
      endDate: '2026-05-15'
    });
  });

  it('keeps explicit dates when startDate is before endDate', () => {
    assert.deepEqual(
      resolveAnalyticsPeriod({ startDate: '2026-05-01', endDate: '2026-05-14' }, today),
      { startDate: '2026-05-01', endDate: '2026-05-14' }
    );
  });

  it('rejects inverted explicit dates', () => {
    assert.throws(
      () => resolveAnalyticsPeriod({ startDate: '2026-05-14', endDate: '2026-05-01' }, today),
      /startDate must be before or equal to endDate/
    );
  });

  it('rejects invalid explicit calendar dates', () => {
    assert.throws(
      () => resolveAnalyticsPeriod({ startDate: '2026-02-31', endDate: '2026-03-01' }, today),
      /Expected real date in YYYY-MM-DD format/
    );
  });
});
