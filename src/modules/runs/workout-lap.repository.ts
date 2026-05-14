import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { CreateWorkoutLapInput, WorkoutLap, WorkoutLapKind } from './workout-lap.js';

type WorkoutLapRow = {
  draft_run_id: string;
  lap_number: number;
  lap_kind: WorkoutLapKind;
  distance_meters: number;
  corrected_distance_meters: number | null;
  moving_time_seconds: number;
  elapsed_time_seconds: number;
  average_heartrate: string | null;
  max_heartrate: number | null;
  heart_rate_recovery_bpm: string | null;
  needs_review: boolean;
};

export class WorkoutLapRepository {
  constructor(private readonly pool: Pool) {}

  async replaceForDraftRun(draftRunId: string, laps: CreateWorkoutLapInput[]): Promise<void> {
    await this.pool.query('delete from workout_laps where draft_run_id = $1', [draftRunId]);

    for (const lap of laps) {
      await this.pool.query(
        `insert into workout_laps (
          id,
          user_id,
          draft_run_id,
          strava_activity_id,
          lap_number,
          lap_kind,
          distance_meters,
          corrected_distance_meters,
          moving_time_seconds,
          elapsed_time_seconds,
          average_heartrate,
          max_heartrate,
          heart_rate_recovery_bpm,
          needs_review,
          raw_lap
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          randomUUID(),
          lap.userId,
          lap.draftRunId,
          lap.stravaActivityId,
          lap.lapNumber,
          lap.lapKind,
          lap.distanceMeters,
          lap.correctedDistanceMeters,
          lap.movingTimeSeconds,
          lap.elapsedTimeSeconds,
          lap.averageHeartrate,
          lap.maxHeartrate,
          lap.heartRateRecoveryBpm,
          lap.needsReview,
          JSON.stringify(lap.rawLap)
        ]
      );
    }
  }

  async correctWorkLapDistances(input: {
    draftRunId: string;
    correctedDistanceMeters: number;
    tolerancePercent: number;
    lapCorrections: Array<{ lapNumber: number; correctedDistanceMeters: number }>;
  }): Promise<void> {
    await this.pool.query(
      `update workout_laps
      set corrected_distance_meters = case
          when distance_meters between $2 * (1 - $3::numeric) and $2 * (1 + $3::numeric) then $2
          else null
        end,
        needs_review = not (distance_meters between $2 * (1 - $3::numeric) and $2 * (1 + $3::numeric)),
        updated_at = now()
      where draft_run_id = $1 and lap_kind = 'work'`,
      [input.draftRunId, input.correctedDistanceMeters, input.tolerancePercent / 100]
    );

    for (const correction of input.lapCorrections) {
      await this.pool.query(
        `update workout_laps
        set corrected_distance_meters = $3,
          needs_review = false,
          updated_at = now()
        where draft_run_id = $1 and lap_number = $2 and lap_kind = 'work'`,
        [input.draftRunId, correction.lapNumber, correction.correctedDistanceMeters]
      );
    }
  }

  async listByDraftRunIds(draftRunIds: string[]): Promise<WorkoutLap[]> {
    if (draftRunIds.length === 0) {
      return [];
    }

    const result = await this.pool.query<WorkoutLapRow>(
      `select draft_run_id,
        lap_number,
        lap_kind,
        distance_meters,
        corrected_distance_meters,
        moving_time_seconds,
        elapsed_time_seconds,
        average_heartrate,
        max_heartrate,
        heart_rate_recovery_bpm,
        needs_review
      from workout_laps
      where draft_run_id = any($1::uuid[])
      order by draft_run_id, lap_number`,
      [draftRunIds]
    );

    return result.rows.map((row) => ({
      draftRunId: row.draft_run_id,
      lapNumber: row.lap_number,
      lapKind: row.lap_kind,
      distanceMeters: row.distance_meters,
      correctedDistanceMeters: row.corrected_distance_meters,
      movingTimeSeconds: row.moving_time_seconds,
      elapsedTimeSeconds: row.elapsed_time_seconds,
      averageHeartrate: row.average_heartrate ? Number(row.average_heartrate) : null,
      maxHeartrate: row.max_heartrate,
      heartRateRecoveryBpm: row.heart_rate_recovery_bpm ? Number(row.heart_rate_recovery_bpm) : null,
      needsReview: row.needs_review
    }));
  }
}
