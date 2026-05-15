import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AnalyticsQueryService } from './analytics-query.service.js';

describe('AnalyticsQueryService', () => {
  it('answers rule-classified questions without calling the LLM', async () => {
    const resultData = {
      startDate: '2026-05-11',
      endDate: '2026-05-17',
      runCount: 2,
      totalDistanceMeters: 12345,
      totalDistanceKm: 12.35,
      runs: []
    };
    let receivedInput: unknown;
    const service = new AnalyticsQueryService(
      {
        execute: async (input) => {
          receivedInput = input;
          return [{ intent: 'distance_summary', data: resultData }];
        }
      },
      {
        isConfigured: () => true,
        classify: async () => {
          throw new Error('LLM should not be called for rule matches');
        }
      },
      { now: () => new Date('2026-05-15T12:00:00.000Z') }
    );

    const response = await service.query({ userId: 'user-1', question: 'сколько я пробежал за неделю' });

    assert.deepEqual(receivedInput, {
      userId: 'user-1',
      intents: [
        {
          name: 'distance_summary',
          parameters: { period: 'this_week', startDate: '2026-05-11', endDate: '2026-05-17' },
          confidence: 0.95
        }
      ]
    });
    assert.deepEqual(response, {
      status: 'answered',
      source: 'rules',
      intents: [
        {
          name: 'distance_summary',
          parameters: { period: 'this_week', startDate: '2026-05-11', endDate: '2026-05-17' },
          confidence: 0.95
        }
      ],
      results: [{ intent: 'distance_summary', data: resultData }]
    });
  });

  it('returns clarification options for ambiguous questions when LLM is not configured', async () => {
    const service = new AnalyticsQueryService(
      {
        execute: async () => {
          throw new Error('executor should not be called for clarification');
        }
      },
      { isConfigured: () => false, classify: async () => ({ source: 'llm', intents: [] }) },
      { now: () => new Date('2026-05-15T12:00:00.000Z') }
    );

    const response = await service.query({ userId: 'user-1', question: 'как у меня с тренировками' });

    assert.equal(response.status, 'needs_clarification');
    assert.equal(response.options.length, 3);
  });
});
