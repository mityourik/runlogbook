import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  analyticsIntentCatalog,
  analyticsIntentNames,
  classifiedAnalyticsIntentSchema
} from './analytics-intents.js';

describe('analytics intents', () => {
  it('defines the supported intent catalog', () => {
    assert.deepEqual(analyticsIntentNames, [
      'distance_summary',
      'run_count_summary',
      'duration_summary',
      'pace_summary',
      'weekly_summary',
      'longest_run',
      'effort_summary',
      'plan_adherence',
      'planned_vs_actual',
      'workout_type_breakdown',
      'workout_summary',
      'lap_summary'
    ]);

    assert.equal(analyticsIntentCatalog.length, analyticsIntentNames.length);

    for (const entry of analyticsIntentCatalog) {
      assert.equal(typeof entry.description, 'string');
      assert.ok(entry.description.length > 0);
      assert.ok(entry.examples.length > 0);
      assert.ok(Array.isArray(entry.parameters));
    }
  });

  it('keeps catalog parameters aligned with approved intent-specific schemas', () => {
    const weeklySummary = analyticsIntentCatalog.find((entry) => entry.name === 'weekly_summary');
    const planAdherence = analyticsIntentCatalog.find((entry) => entry.name === 'plan_adherence');

    assert.deepEqual(weeklySummary?.parameters, ['weekStart']);
    assert.deepEqual(planAdherence?.parameters, ['period']);
  });

  it('rejects unknown classified intent names', () => {
    assert.throws(
      () => classifiedAnalyticsIntentSchema.parse({ name: 'raw_sql', parameters: {}, confidence: 1 }),
      /Invalid enum value/
    );
  });

  it('rejects parameters that are not allowed for the classified intent', () => {
    assert.throws(() =>
      classifiedAnalyticsIntentSchema.parse({
        name: 'distance_summary',
        parameters: { runId: '00000000-0000-4000-8000-000000000000' }
      })
    );

    assert.throws(() =>
      classifiedAnalyticsIntentSchema.parse({
        name: 'weekly_summary',
        parameters: { runId: '00000000-0000-4000-8000-000000000000' }
      })
    );
  });

  it('rejects invalid calendar dates in classified intent parameters', () => {
    assert.throws(
      () =>
        classifiedAnalyticsIntentSchema.parse({
          name: 'distance_summary',
          parameters: { startDate: '2026-02-31', endDate: '2026-03-01' },
          confidence: 1
        }),
      /Expected real date in YYYY-MM-DD format/
    );

    assert.throws(
      () =>
        classifiedAnalyticsIntentSchema.parse({
          name: 'weekly_summary',
          parameters: { weekStart: '2026-02-31' },
          confidence: 1
        }),
      /Expected real date in YYYY-MM-DD format/
    );
  });
});
