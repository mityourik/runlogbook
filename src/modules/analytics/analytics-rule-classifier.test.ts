import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyAnalyticsQuestionWithRules } from './analytics-rule-classifier.js';

describe('analytics rule classifier', () => {
  it('classifies weekly distance questions', () => {
    assert.deepEqual(classifyAnalyticsQuestionWithRules('сколько я пробежал за неделю')?.intents, [
      { name: 'distance_summary', parameters: { period: 'this_week' }, confidence: 0.95 }
    ]);
  });

  it('classifies pace questions for the last 30 days', () => {
    assert.deepEqual(classifyAnalyticsQuestionWithRules('какой темп за последние 30 дней')?.intents, [
      { name: 'pace_summary', parameters: { period: 'last_30_days' }, confidence: 0.9 }
    ]);
  });

  it('classifies multi-intent monthly distance and pace questions', () => {
    assert.deepEqual(classifyAnalyticsQuestionWithRules('километраж и темп за месяц')?.intents, [
      { name: 'distance_summary', parameters: { period: 'this_month' }, confidence: 0.9 },
      { name: 'pace_summary', parameters: { period: 'this_month' }, confidence: 0.9 }
    ]);
  });

  it('returns null for ambiguous workout status questions', () => {
    assert.equal(classifyAnalyticsQuestionWithRules('как у меня с тренировками'), null);
  });

  it('returns null for broad questions matching more than four intent types', () => {
    assert.equal(
      classifyAnalyticsQuestionWithRules(
        'километраж темп сколько пробежек сколько времени самая длинная за неделю'
      ),
      null
    );
  });
});
