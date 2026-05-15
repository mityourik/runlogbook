import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAnalyticsClarificationOptions } from './analytics-clarification.js';

describe('analytics clarification options', () => {
  it('builds executable generic clarification options', () => {
    assert.deepEqual(buildAnalyticsClarificationOptions('как у меня с тренировками'), [
      {
        label: 'Километраж за эту неделю',
        intents: [{ name: 'distance_summary', parameters: { period: 'this_week' }, confidence: 1 }]
      },
      {
        label: 'Выполнение плана',
        intents: [{ name: 'plan_adherence', parameters: {}, confidence: 1 }]
      },
      {
        label: 'Разбивка по типам за эту неделю',
        intents: [{ name: 'workout_type_breakdown', parameters: { period: 'this_week' }, confidence: 1 }]
      }
    ]);
  });
});
