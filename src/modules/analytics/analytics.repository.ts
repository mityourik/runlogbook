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

export type RunCountSummary = { startDate: string; endDate: string; runCount: number };
export type DurationSummary = { startDate: string; endDate: string; totalDurationSeconds: number; runs: DistanceSummaryRun[] };
export type PaceSummary = {
  startDate: string;
  endDate: string;
  averagePaceSecondsPerKm: number | null;
  runs: Array<DistanceSummaryRun & { paceSecondsPerKm: number | null }>;
};
export type LongestRunSummary = { startDate: string; endDate: string; runs: DistanceSummaryRun[] };
export type EffortSummary = {
  startDate: string;
  endDate: string;
  averagePerceivedEffort: number | null;
  distribution: Array<{ effort: number; count: number }>;
};
export type PlannedVsActualSummary = {
  startDate: string;
  endDate: string;
  items: Array<{
    plannedWorkoutId: string;
    scheduledOn: string;
    title: string;
    status: string;
    completedRunId: string | null;
    matchStatus: 'linked' | 'same_day' | 'unmatched';
    runId: string | null;
    runTitle: string | null;
  }>;
};
export type WorkoutTypeBreakdown = {
  startDate: string;
  endDate: string;
  groups: Array<{ workoutKind: string | null; runCount: number; totalDistanceMeters: number; totalDurationSeconds: number }>;
};
export type WorkoutSummary = {
  startDate: string;
  endDate: string;
  runs: Array<DistanceSummaryRun & { workoutStructure: string | null; perceivedEffort: number | null }>;
};
export type LapSummary = {
  startDate: string;
  endDate: string;
  runs: Array<{
    runId: string;
    occurredOn: string;
    title: string | null;
    laps: Array<{
      lapNumber: number;
      lapKind: string;
      distanceMeters: number;
      correctedDistanceMeters: number | null;
      movingTimeSeconds: number;
      elapsedTimeSeconds: number;
      averageHeartrate: number | null;
      maxHeartrate: number | null;
      heartRateRecoveryBpm: number | null;
      needsReview: boolean;
    }>;
  }>;
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

type RunWithWorkoutRow = DistanceSummaryRunRow & {
  workout_structure: string | null;
  perceived_effort: number | null;
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

  async getRunCountSummary(input: { userId: string; startDate: string; endDate: string }): Promise<RunCountSummary> {
    const result = await this.pool.query<{ run_count: string }>(
      `select count(*) as run_count
      from runs
      where user_id = $1 and occurred_on >= $2 and occurred_on <= $3`,
      [input.userId, input.startDate, input.endDate]
    );

    return { startDate: input.startDate, endDate: input.endDate, runCount: Number(result.rows[0]?.run_count ?? 0) };
  }

  async getDurationSummary(input: { userId: string; startDate: string; endDate: string }): Promise<DurationSummary> {
    const runs = await this.getDistanceSummaryRuns(input);

    return {
      startDate: input.startDate,
      endDate: input.endDate,
      totalDurationSeconds: runs.reduce((total, run) => total + run.durationSeconds, 0),
      runs
    };
  }

  async getPaceSummary(input: { userId: string; startDate: string; endDate: string }): Promise<PaceSummary> {
    const runs = (await this.getDistanceSummaryRuns(input)).map((run) => ({
      ...run,
      paceSecondsPerKm: run.distanceMeters > 0 ? Math.round(run.durationSeconds / (run.distanceMeters / 1000)) : null
    }));
    const totalDistanceMeters = runs.reduce((total, run) => total + run.distanceMeters, 0);
    const totalDurationSeconds = runs.reduce((total, run) => total + run.durationSeconds, 0);

    return {
      startDate: input.startDate,
      endDate: input.endDate,
      averagePaceSecondsPerKm:
        totalDistanceMeters > 0 ? Math.round(totalDurationSeconds / (totalDistanceMeters / 1000)) : null,
      runs
    };
  }

  async getLongestRun(input: { userId: string; startDate: string; endDate: string }): Promise<LongestRunSummary> {
    const result = await this.pool.query<DistanceSummaryRunRow>(
      `select id, occurred_on, title, distance_meters, duration_seconds
      from runs
      where user_id = $1 and occurred_on >= $2 and occurred_on <= $3
      order by distance_meters desc, occurred_on desc, created_at desc
      limit 1`,
      [input.userId, input.startDate, input.endDate]
    );

    return { startDate: input.startDate, endDate: input.endDate, runs: result.rows.map(toDistanceSummaryRun) };
  }

  async getEffortSummary(input: { userId: string; startDate: string; endDate: string }): Promise<EffortSummary> {
    const result = await this.pool.query<{ effort: number; count: string; average_effort: string | null }>(
      `with filtered as (
        select perceived_effort
        from runs
        where user_id = $1 and occurred_on >= $2 and occurred_on <= $3 and perceived_effort is not null
      ), average as (
        select avg(perceived_effort) as average_effort
        from filtered
      )
      select filtered.perceived_effort as effort, count(*) as count, average.average_effort
      from filtered
      cross join average
      group by filtered.perceived_effort, average.average_effort
      order by filtered.perceived_effort`,
      [input.userId, input.startDate, input.endDate]
    );

    return {
      startDate: input.startDate,
      endDate: input.endDate,
      averagePerceivedEffort: result.rows[0]?.average_effort ? Number(Number(result.rows[0].average_effort).toFixed(1)) : null,
      distribution: result.rows.map((row) => ({ effort: row.effort, count: Number(row.count) }))
    };
  }

  async getPlannedVsActual(input: { userId: string; startDate: string; endDate: string }): Promise<PlannedVsActualSummary> {
    const result = await this.pool.query<{
      planned_workout_id: string;
      scheduled_on: string;
      title: string;
      status: string;
      completed_run_id: string | null;
      linked_run_id: string | null;
      linked_run_title: string | null;
      same_day_run_id: string | null;
      same_day_run_title: string | null;
    }>(
      `select
        pw.id as planned_workout_id,
        pw.scheduled_on,
        pw.title,
        pw.status,
        pw.completed_run_id,
        linked_run.id as linked_run_id,
        linked_run.title as linked_run_title,
        same_day_run.id as same_day_run_id,
        same_day_run.title as same_day_run_title
      from planned_workouts pw
      join training_plans tp on tp.id = pw.training_plan_id and tp.user_id = $1
      left join runs linked_run on linked_run.id = pw.completed_run_id and linked_run.user_id = $1
      left join lateral (
        select id, title
        from runs
        where user_id = $1 and occurred_on = pw.scheduled_on and pw.completed_run_id is null
        order by created_at desc
        limit 1
      ) same_day_run on true
      where pw.scheduled_on >= $2 and pw.scheduled_on <= $3
      order by pw.scheduled_on asc, pw.created_at asc`,
      [input.userId, input.startDate, input.endDate]
    );

    return {
      startDate: input.startDate,
      endDate: input.endDate,
      items: result.rows.map((row) => ({
        plannedWorkoutId: row.planned_workout_id,
        scheduledOn: row.scheduled_on,
        title: row.title,
        status: row.status,
        completedRunId: row.completed_run_id,
        matchStatus: row.linked_run_id ? 'linked' : row.same_day_run_id ? 'same_day' : 'unmatched',
        runId: row.linked_run_id ?? row.same_day_run_id,
        runTitle: row.linked_run_title ?? row.same_day_run_title
      }))
    };
  }

  async getWorkoutTypeBreakdown(input: {
    userId: string;
    startDate: string;
    endDate: string;
    workoutKind?: string;
  }): Promise<WorkoutTypeBreakdown> {
    const result = await this.pool.query<{
      workout_kind: string | null;
      run_count: string;
      total_distance_meters: string | null;
      total_duration_seconds: string | null;
    }>(
      `select
        workout_kind,
        count(*) as run_count,
        coalesce(sum(distance_meters), 0) as total_distance_meters,
        coalesce(sum(duration_seconds), 0) as total_duration_seconds
      from runs
      where user_id = $1 and occurred_on >= $2 and occurred_on <= $3 and ($4::text is null or workout_kind = $4)
      group by workout_kind
      order by workout_kind nulls last`,
      [input.userId, input.startDate, input.endDate, input.workoutKind ?? null]
    );

    return {
      startDate: input.startDate,
      endDate: input.endDate,
      groups: result.rows.map((row) => ({
        workoutKind: row.workout_kind,
        runCount: Number(row.run_count),
        totalDistanceMeters: Number(row.total_distance_meters ?? 0),
        totalDurationSeconds: Number(row.total_duration_seconds ?? 0)
      }))
    };
  }

  async getWorkoutSummary(input: {
    userId: string;
    startDate: string;
    endDate: string;
    workoutKind?: string;
  }): Promise<WorkoutSummary> {
    const workoutKind = input.workoutKind ?? 'workout';
    const result = await this.pool.query<RunWithWorkoutRow>(
      `select id, occurred_on, title, distance_meters, duration_seconds, workout_structure, perceived_effort
      from runs
      where user_id = $1 and occurred_on >= $2 and occurred_on <= $3 and workout_kind = $4
      order by occurred_on desc, created_at desc`,
      [input.userId, input.startDate, input.endDate, workoutKind]
    );

    return {
      startDate: input.startDate,
      endDate: input.endDate,
      runs: result.rows.map((row) => ({
        ...toDistanceSummaryRun(row),
        workoutStructure: row.workout_structure,
        perceivedEffort: row.perceived_effort
      }))
    };
  }

  async getLapSummary(input: { userId: string; startDate: string; endDate: string; runId?: string }): Promise<LapSummary> {
    const result = await this.pool.query<{
      run_id: string;
      occurred_on: string;
      title: string | null;
      lap_number: number;
      lap_kind: string;
      distance_meters: number;
      corrected_distance_meters: number | null;
      moving_time_seconds: number;
      elapsed_time_seconds: number;
      average_heartrate: string | null;
      max_heartrate: number | null;
      heart_rate_recovery_bpm: string | null;
      needs_review: boolean;
    }>(
      `select
        r.id as run_id,
        r.occurred_on,
        r.title,
        wl.lap_number,
        wl.lap_kind,
        wl.distance_meters,
        wl.corrected_distance_meters,
        wl.moving_time_seconds,
        wl.elapsed_time_seconds,
        wl.average_heartrate,
        wl.max_heartrate,
        wl.heart_rate_recovery_bpm,
        wl.needs_review
      from runs r
      join draft_runs dr on dr.clarified_run_id = r.id and dr.user_id = $1
      join workout_laps wl on wl.draft_run_id = dr.id and wl.user_id = $1
      where r.user_id = $1 and r.occurred_on >= $2 and r.occurred_on <= $3 and ($4::uuid is null or r.id = $4::uuid)
      order by r.occurred_on desc, r.created_at desc, wl.lap_number asc`,
      [input.userId, input.startDate, input.endDate, input.runId ?? null]
    );
    const runs = new Map<string, LapSummary['runs'][number]>();

    for (const row of result.rows) {
      let run = runs.get(row.run_id);

      if (!run) {
        run = { runId: row.run_id, occurredOn: row.occurred_on, title: row.title, laps: [] };
        runs.set(row.run_id, run);
      }

      run.laps.push({
        lapNumber: row.lap_number,
        lapKind: row.lap_kind,
        distanceMeters: row.distance_meters,
        correctedDistanceMeters: row.corrected_distance_meters,
        movingTimeSeconds: row.moving_time_seconds,
        elapsedTimeSeconds: row.elapsed_time_seconds,
        averageHeartrate: row.average_heartrate === null ? null : Number(row.average_heartrate),
        maxHeartrate: row.max_heartrate,
        heartRateRecoveryBpm: row.heart_rate_recovery_bpm === null ? null : Number(row.heart_rate_recovery_bpm),
        needsReview: row.needs_review
      });
    }

    return { startDate: input.startDate, endDate: input.endDate, runs: [...runs.values()] };
  }

  private async getDistanceSummaryRuns(input: {
    userId: string;
    startDate: string;
    endDate: string;
  }): Promise<DistanceSummaryRun[]> {
    const result = await this.pool.query<DistanceSummaryRunRow>(
      `select id, occurred_on, title, distance_meters, duration_seconds
      from runs
      where user_id = $1 and occurred_on >= $2 and occurred_on <= $3
      order by occurred_on desc, created_at desc`,
      [input.userId, input.startDate, input.endDate]
    );

    return result.rows.map(toDistanceSummaryRun);
  }
}

function toDistanceSummaryRun(row: DistanceSummaryRunRow): DistanceSummaryRun {
  return {
    id: row.id,
    occurredOn: row.occurred_on,
    title: row.title,
    distanceMeters: row.distance_meters,
    distanceKm: roundKm(row.distance_meters),
    durationSeconds: row.duration_seconds
  };
}

function roundKm(distanceMeters: number): number {
  return Math.round((distanceMeters / 1000) * 100) / 100;
}
