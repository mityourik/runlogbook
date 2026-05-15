import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AnalyticsQueryExecutor } from './analytics-query-executor.js';

describe('AnalyticsQueryExecutor', () => {
  it('executes distance and pace intents against repository methods', async () => {
    const calls: string[] = [];
    const executor = new AnalyticsQueryExecutor({
      getDistanceSummary: async () => {
        calls.push('distance');
        return {
          startDate: '2026-05-11',
          endDate: '2026-05-17',
          runCount: 1,
          totalDistanceMeters: 10000,
          totalDistanceKm: 10,
          runs: []
        };
      },
      getPaceSummary: async () => {
        calls.push('pace');
        return { startDate: '2026-05-11', endDate: '2026-05-17', averagePaceSecondsPerKm: 300, runs: [] };
      }
    });

    const results = await executor.execute({
      userId: 'user-1',
      intents: [
        {
          name: 'distance_summary',
          parameters: { period: 'this_week', startDate: '2026-05-11', endDate: '2026-05-17' },
          confidence: 1
        },
        {
          name: 'pace_summary',
          parameters: { period: 'this_week', startDate: '2026-05-11', endDate: '2026-05-17' },
          confidence: 1
        }
      ]
    });

    assert.deepEqual(calls, ['distance', 'pace']);
    assert.equal(results[0].intent, 'distance_summary');
    assert.equal(results[1].intent, 'pace_summary');
  });
});
