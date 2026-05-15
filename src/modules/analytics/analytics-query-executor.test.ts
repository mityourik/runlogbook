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

  it('computes weekly summary end date from weekStart when endDate is absent', async () => {
    let receivedInput: unknown;
    const executor = new AnalyticsQueryExecutor({
      getWeeklySummary: async (input) => {
        receivedInput = input;
        return {
          weekStart: input.weekStart,
          weekEnd: input.weekEnd,
          runCount: 0,
          totalDistanceMeters: 0,
          totalDurationSeconds: 0,
          longestRunMeters: 0,
          averagePaceSecondsPerKm: null,
          averagePerceivedEffort: null
        };
      }
    });

    await executor.execute({
      userId: 'user-1',
      intents: [{ name: 'weekly_summary', parameters: { weekStart: '2026-05-11' }, confidence: 1 }]
    });

    assert.deepEqual(receivedInput, { userId: 'user-1', weekStart: '2026-05-11', weekEnd: '2026-05-17' });
  });

  it('uses injected today for plan adherence when endDate is absent', async () => {
    const dates: string[] = [];
    const executor = new AnalyticsQueryExecutor(
      {
        getCurrentPlanAdherence: async (_userId, onDate) => {
          dates.push(onDate);
          return { planId: null, plannedCount: 0, completedCount: 0, changedCount: 0, skippedCount: 0, adherencePercent: null };
        }
      },
      { now: () => new Date('2026-04-02T12:00:00.000Z') }
    );

    await executor.execute({
      userId: 'user-1',
      intents: [{ name: 'plan_adherence', parameters: {}, confidence: 1 }]
    });

    assert.deepEqual(dates, ['2026-04-02']);
  });

  it('uses plan adherence endDate when provided', async () => {
    const dates: string[] = [];
    const executor = new AnalyticsQueryExecutor(
      {
        getCurrentPlanAdherence: async (_userId, onDate) => {
          dates.push(onDate);
          return { planId: null, plannedCount: 0, completedCount: 0, changedCount: 0, skippedCount: 0, adherencePercent: null };
        }
      },
      { now: () => new Date('2026-05-15T12:00:00.000Z') }
    );

    await executor.execute({
      userId: 'user-1',
      intents: [{ name: 'plan_adherence', parameters: { endDate: '2026-05-12' }, confidence: 1 }]
    });

    assert.deepEqual(dates, ['2026-05-12']);
  });

  it('throws when a period intent is missing startDate and endDate', async () => {
    const executor = new AnalyticsQueryExecutor({});

    await assert.rejects(
      () =>
        executor.execute({
          userId: 'user-1',
          intents: [{ name: 'distance_summary', parameters: { startDate: '2026-05-11' }, confidence: 1 }]
        }),
      /Intent distance_summary requires startDate and endDate/
    );
  });

  it('passes workoutKind to workout type breakdown', async () => {
    let receivedInput: unknown;
    const executor = new AnalyticsQueryExecutor({
      getWorkoutTypeBreakdown: async (input) => {
        receivedInput = input;
        return { startDate: input.startDate, endDate: input.endDate, groups: [] };
      }
    });

    await executor.execute({
      userId: 'user-1',
      intents: [
        {
          name: 'workout_type_breakdown',
          parameters: { startDate: '2026-05-11', endDate: '2026-05-17', workoutKind: 'long' },
          confidence: 1
        }
      ]
    });

    assert.deepEqual(receivedInput, {
      userId: 'user-1',
      startDate: '2026-05-11',
      endDate: '2026-05-17',
      workoutKind: 'long'
    });
  });

  it('passes runId and default workoutKind to workout summary', async () => {
    let receivedInput: unknown;
    const executor = new AnalyticsQueryExecutor({
      getWorkoutSummary: async (input) => {
        receivedInput = input;
        return { startDate: input.startDate, endDate: input.endDate, runs: [] };
      }
    });

    await executor.execute({
      userId: 'user-1',
      intents: [
        {
          name: 'workout_summary',
          parameters: {
            startDate: '2026-05-11',
            endDate: '2026-05-17',
            runId: '11111111-1111-4111-8111-111111111111'
          },
          confidence: 1
        }
      ]
    });

    assert.deepEqual(receivedInput, {
      userId: 'user-1',
      startDate: '2026-05-11',
      endDate: '2026-05-17',
      workoutKind: 'workout',
      runId: '11111111-1111-4111-8111-111111111111'
    });
  });

  it('passes runId to lap summary', async () => {
    let receivedInput: unknown;
    const executor = new AnalyticsQueryExecutor({
      getLapSummary: async (input) => {
        receivedInput = input;
        return { startDate: input.startDate, endDate: input.endDate, runs: [] };
      }
    });

    await executor.execute({
      userId: 'user-1',
      intents: [
        {
          name: 'lap_summary',
          parameters: {
            startDate: '2026-05-11',
            endDate: '2026-05-17',
            runId: '11111111-1111-4111-8111-111111111111'
          },
          confidence: 1
        }
      ]
    });

    assert.deepEqual(receivedInput, {
      userId: 'user-1',
      startDate: '2026-05-11',
      endDate: '2026-05-17',
      runId: '11111111-1111-4111-8111-111111111111'
    });
  });
});
