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

  it('rejects unknown classified intent names', () => {
    assert.throws(
      () => classifiedAnalyticsIntentSchema.parse({ name: 'raw_sql', parameters: {}, confidence: 1 }),
      /Invalid enum value/
    );
  });
});
