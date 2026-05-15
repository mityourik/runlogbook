import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Pool } from 'pg';
import { AnalyticsRepository } from './analytics.repository.js';

describe('AnalyticsRepository', () => {
  it('filters current plan adherence planned workouts by scheduled range when supplied', async () => {
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const repository = new AnalyticsRepository(fakePool(queries) as unknown as Pool);

    await (repository.getCurrentPlanAdherence as any)('user-1', '2026-05-31', {
      startDate: '2026-05-01',
      endDate: '2026-05-31'
    });

    const adherenceQuery = queries[1];

    assert.match(adherenceQuery.sql, /scheduled_on >= \$2/);
    assert.match(adherenceQuery.sql, /scheduled_on <= \$3/);
    assert.deepEqual(adherenceQuery.values, ['plan-1', '2026-05-01', '2026-05-31']);
  });

  it('keeps current plan adherence scoped to the whole active plan when no range is supplied', async () => {
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const repository = new AnalyticsRepository(fakePool(queries) as unknown as Pool);

    await repository.getCurrentPlanAdherence('user-1', '2026-05-31');

    const adherenceQuery = queries[1];

    assert.doesNotMatch(adherenceQuery.sql, /scheduled_on >=/);
    assert.doesNotMatch(adherenceQuery.sql, /scheduled_on <=/);
    assert.deepEqual(adherenceQuery.values, ['plan-1']);
  });
});

function fakePool(queries: Array<{ sql: string; values: unknown[] }>) {
  return {
    async query(sql: string, values: unknown[]) {
      queries.push({ sql, values });

      if (queries.length === 1) {
        return { rows: [{ id: 'plan-1' }] };
      }

      return { rows: [{ planned_count: '4', completed_count: '2', changed_count: '1', skipped_count: '1' }] };
    }
  };
}
