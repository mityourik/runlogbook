import type { ClassifiedAnalyticsIntent } from './analytics-intents.js';
import type { AnalyticsRepository } from './analytics.repository.js';

export type AnalyticsQueryResult = {
  intent: string;
  data: unknown;
};

type AnalyticsRepositoryLike = Partial<AnalyticsRepository>;

export class AnalyticsQueryExecutor {
  constructor(private readonly repository: AnalyticsRepositoryLike) {}

  async execute(input: { userId: string; intents: ClassifiedAnalyticsIntent[] }): Promise<AnalyticsQueryResult[]> {
    const results: AnalyticsQueryResult[] = [];

    for (const intent of input.intents) {
      const startDate = intent.parameters.startDate;
      const endDate = intent.parameters.endDate;

      if (intent.name === 'weekly_summary') {
        const weekStart = intent.parameters.weekStart ?? startDate;

        if (!weekStart || !endDate) {
          throw new Error('Intent weekly_summary requires weekStart and endDate');
        }

        results.push({
          intent: intent.name,
          data: await this.require('getWeeklySummary')({ userId: input.userId, weekStart, weekEnd: endDate })
        });
        continue;
      }

      if (intent.name === 'plan_adherence') {
        results.push({
          intent: intent.name,
          data: await this.require('getCurrentPlanAdherence')(input.userId, new Date().toISOString().slice(0, 10))
        });
        continue;
      }

      if (!startDate || !endDate) {
        throw new Error(`Intent ${intent.name} requires startDate and endDate`);
      }

      const periodInput = { userId: input.userId, startDate, endDate };

      if (intent.name === 'distance_summary') {
        results.push({ intent: intent.name, data: await this.require('getDistanceSummary')(periodInput) });
      } else if (intent.name === 'run_count_summary') {
        results.push({ intent: intent.name, data: await this.require('getRunCountSummary')(periodInput) });
      } else if (intent.name === 'duration_summary') {
        results.push({ intent: intent.name, data: await this.require('getDurationSummary')(periodInput) });
      } else if (intent.name === 'pace_summary') {
        results.push({ intent: intent.name, data: await this.require('getPaceSummary')(periodInput) });
      } else if (intent.name === 'longest_run') {
        results.push({ intent: intent.name, data: await this.require('getLongestRun')(periodInput) });
      } else if (intent.name === 'effort_summary') {
        results.push({ intent: intent.name, data: await this.require('getEffortSummary')(periodInput) });
      } else if (intent.name === 'planned_vs_actual') {
        results.push({ intent: intent.name, data: await this.require('getPlannedVsActual')(periodInput) });
      } else if (intent.name === 'workout_type_breakdown') {
        results.push({ intent: intent.name, data: await this.require('getWorkoutTypeBreakdown')(periodInput) });
      } else if (intent.name === 'workout_summary') {
        results.push({ intent: intent.name, data: await this.require('getWorkoutSummary')(periodInput) });
      } else if (intent.name === 'lap_summary') {
        results.push({
          intent: intent.name,
          data: await this.require('getLapSummary')({ ...periodInput, runId: intent.parameters.runId })
        });
      } else {
        throw new Error(`Unsupported analytics intent: ${intent.name}`);
      }
    }

    return results;
  }

  private require(name: keyof AnalyticsRepository): (...args: any[]) => Promise<any> {
    const method = this.repository[name];

    if (typeof method !== 'function') {
      throw new Error(`Analytics repository method ${String(name)} is not available`);
    }

    return method.bind(this.repository) as (...args: any[]) => Promise<any>;
  }
}
