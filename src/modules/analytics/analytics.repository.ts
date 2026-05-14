import type { Pool } from 'pg';

export type WeeklySummary = {
  weekStart: string;
  weekEnd: string;
  runCount: number;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  longestRunMeters: number;
  averagePaceSecondsPerKm: number | null;
  averagePerceivedEffort: number | null;
};

export type PlanAdherence = {
  planId: string | null;
  plannedCount: number;
  completedCount: number;
  changedCount: number;
  skippedCount: number;
  adherencePercent: number | null;
};

export type DistanceSummaryRun = {
  id: string;
  occurredOn: string;
  title: string | null;
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
};

export type DistanceSummary = {
  startDate: string;
  endDate: string;
  runCount: number;
  totalDistanceMeters: number;
  totalDistanceKm: number;
  runs: DistanceSummaryRun[];
};

type WeeklySummaryRow = {
  run_count: string;
  total_distance_meters: string | null;
  total_duration_seconds: string | null;
  longest_run_meters: number | null;
  average_effort: string | null;
};

type PlanAdherenceRow = {
  planned_count: string;
  completed_count: string;
  changed_count: string;
  skipped_count: string;
};

type DistanceSummaryRunRow = {
  id: string;
  occurred_on: string;
  title: string | null;
  distance_meters: number;
  duration_seconds: number;
};

export class AnalyticsRepository {
  constructor(private readonly pool: Pool) {}

  async getWeeklySummary(input: { userId: string; weekStart: string; weekEnd: string }): Promise<WeeklySummary> {
    const result = await this.pool.query<WeeklySummaryRow>(
      `select
        count(*) as run_count,
        coalesce(sum(distance_meters), 0) as total_distance_meters,
        coalesce(sum(duration_seconds), 0) as total_duration_seconds,
        coalesce(max(distance_meters), 0) as longest_run_meters,
        avg(perceived_effort) as average_effort
      from runs
      where user_id = $1 and occurred_on >= $2 and occurred_on <= $3`,
      [input.userId, input.weekStart, input.weekEnd]
    );
    const row = result.rows[0];
    const totalDistanceMeters = Number(row.total_distance_meters ?? 0);
    const totalDurationSeconds = Number(row.total_duration_seconds ?? 0);

    return {
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
      runCount: Number(row.run_count),
      totalDistanceMeters,
      totalDurationSeconds,
      longestRunMeters: row.longest_run_meters ?? 0,
      averagePaceSecondsPerKm:
        totalDistanceMeters > 0 ? Math.round(totalDurationSeconds / (totalDistanceMeters / 1000)) : null,
      averagePerceivedEffort: row.average_effort ? Number(Number(row.average_effort).toFixed(1)) : null
    };
  }

  async getCurrentPlanAdherence(userId: string, onDate: string): Promise<PlanAdherence> {
    const planResult = await this.pool.query<{ id: string }>(
      `select id
      from training_plans
      where user_id = $1
        and starts_on <= $2
        and (ends_on is null or ends_on >= $2)
      order by starts_on desc, created_at desc
      limit 1`,
      [userId, onDate]
    );
    const planId = planResult.rows[0]?.id ?? null;

    if (!planId) {
      return {
        planId: null,
        plannedCount: 0,
        completedCount: 0,
        changedCount: 0,
        skippedCount: 0,
        adherencePercent: null
      };
    }

    const result = await this.pool.query<PlanAdherenceRow>(
      `select
        count(*) as planned_count,
        count(*) filter (where status = 'completed') as completed_count,
        count(*) filter (where status = 'changed') as changed_count,
        count(*) filter (where status = 'skipped') as skipped_count
      from planned_workouts
      where training_plan_id = $1`,
      [planId]
    );
    const row = result.rows[0];
    const plannedCount = Number(row.planned_count);
    const completedCount = Number(row.completed_count);
    const changedCount = Number(row.changed_count);
    const skippedCount = Number(row.skipped_count);

    return {
      planId,
      plannedCount,
      completedCount,
      changedCount,
      skippedCount,
      adherencePercent: plannedCount > 0 ? Math.round(((completedCount + changedCount) / plannedCount) * 100) : null
    };
  }

  async getDistanceSummary(input: { userId: string; startDate: string; endDate: string }): Promise<DistanceSummary> {
    const result = await this.pool.query<DistanceSummaryRunRow>(
      `select id, occurred_on, title, distance_meters, duration_seconds
      from runs
      where user_id = $1 and occurred_on >= $2 and occurred_on <= $3
      order by occurred_on desc, created_at desc`,
      [input.userId, input.startDate, input.endDate]
    );
    const runs = result.rows.map((row) => ({
      id: row.id,
      occurredOn: row.occurred_on,
      title: row.title,
      distanceMeters: row.distance_meters,
      distanceKm: roundKm(row.distance_meters),
      durationSeconds: row.duration_seconds
    }));
    const totalDistanceMeters = runs.reduce((total, run) => total + run.distanceMeters, 0);

    return {
      startDate: input.startDate,
      endDate: input.endDate,
      runCount: runs.length,
      totalDistanceMeters,
      totalDistanceKm: roundKm(totalDistanceMeters),
      runs
    };
  }
}

function roundKm(distanceMeters: number): number {
  return Math.round((distanceMeters / 1000) * 100) / 100;
}
