import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyticsQueryRequestSchema, distanceSummaryQuerySchema, weeklySummaryQuerySchema } from './analytics.schemas.js';

describe('analytics route query schemas', () => {
  it('rejects invalid weekly summary weekStart calendar dates', () => {
    assert.throws(
      () => weeklySummaryQuerySchema.parse({ weekStart: '2026-02-31' }),
      /Expected real date in YYYY-MM-DD format/
    );
  });

  it('rejects invalid distance summary calendar dates', () => {
    assert.throws(
      () => distanceSummaryQuerySchema.parse({ startDate: '2026-02-31', endDate: '2026-03-01' }),
      /Expected real date in YYYY-MM-DD format/
    );
  });
});

describe('analyticsQueryRequestSchema', () => {
  it('rejects selected options with only startDate', () => {
    assert.throws(
      () =>
        analyticsQueryRequestSchema.parse({
          question: 'сколько я пробежал',
          selectedOption: {
            intents: [{ name: 'distance_summary', parameters: { startDate: '2026-05-01' }, confidence: 1 }]
          }
        }),
      /startDate and endDate are both required/
    );
  });

  it('rejects selected options with inverted dates', () => {
    assert.throws(
      () =>
        analyticsQueryRequestSchema.parse({
          question: 'сколько я пробежал',
          selectedOption: {
            intents: [
              {
                name: 'distance_summary',
                parameters: { startDate: '2026-05-10', endDate: '2026-05-01' },
                confidence: 1
              }
            ]
          }
        }),
      /startDate must be before or equal to endDate/
    );
  });

  it('rejects selected options with invalid calendar dates', () => {
    assert.throws(
      () =>
        analyticsQueryRequestSchema.parse({
          question: 'сколько я пробежал',
          selectedOption: {
            intents: [
              {
                name: 'distance_summary',
                parameters: { startDate: '2026-02-31', endDate: '2026-03-01' },
                confidence: 1
              }
            ]
          }
        }),
      /Expected real date in YYYY-MM-DD format/
    );

    assert.throws(
      () =>
        analyticsQueryRequestSchema.parse({
          question: 'итоги недели',
          selectedOption: {
            intents: [{ name: 'weekly_summary', parameters: { weekStart: '2026-02-31' }, confidence: 1 }]
          }
        }),
      /Expected real date in YYYY-MM-DD format/
    );
  });
});
