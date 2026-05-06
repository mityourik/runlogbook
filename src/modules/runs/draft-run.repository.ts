import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { CreateDraftRunInput, DraftRun } from './draft-run.js';

type DraftRunRow = {
  id: string;
  user_id: string;
  strava_activity_id: string | null;
  strava_activity_url: string | null;
  activity_type: string | null;
  occurred_at: Date;
  distance_meters: number;
  moving_time_seconds: number;
  elapsed_time_seconds: number | null;
  title: string | null;
  clarified_run_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export class DraftRunRepository {
  constructor(private readonly pool: Pool) {}

  async upsertFromStrava(input: CreateDraftRunInput): Promise<DraftRun> {
    const result = await this.pool.query<DraftRunRow>(
      `insert into draft_runs (
        id,
        user_id,
        strava_activity_import_id,
        strava_activity_id,
        strava_activity_url,
        activity_type,
        occurred_at,
        distance_meters,
        moving_time_seconds,
        elapsed_time_seconds,
        title,
        raw_activity
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      on conflict (strava_activity_id) do update set
        strava_activity_import_id = excluded.strava_activity_import_id,
        strava_activity_url = excluded.strava_activity_url,
        activity_type = excluded.activity_type,
        occurred_at = excluded.occurred_at,
        distance_meters = excluded.distance_meters,
        moving_time_seconds = excluded.moving_time_seconds,
        elapsed_time_seconds = excluded.elapsed_time_seconds,
        title = excluded.title,
        raw_activity = excluded.raw_activity,
        updated_at = now()
      returning *`,
      [
        randomUUID(),
        input.userId,
        input.stravaActivityImportId,
        input.stravaActivityId,
        input.stravaActivityUrl,
        input.activityType,
        input.occurredAt,
        input.distanceMeters,
        input.movingTimeSeconds,
        input.elapsedTimeSeconds,
        input.title,
        JSON.stringify(input.rawActivity)
      ]
    );

    return toDraftRun(result.rows[0]);
  }

  async listOpenByUser(userId: string): Promise<DraftRun[]> {
    const result = await this.pool.query<DraftRunRow>(
      `select *
      from draft_runs
      where user_id = $1 and clarified_run_id is null
      order by occurred_at desc`,
      [userId]
    );

    return result.rows.map(toDraftRun);
  }

  async findById(draftRunId: string): Promise<DraftRun | null> {
    const result = await this.pool.query<DraftRunRow>('select * from draft_runs where id = $1', [draftRunId]);
    const row = result.rows[0];

    return row ? toDraftRun(row) : null;
  }

  async markClarified(draftRunId: string, runId: string): Promise<void> {
    await this.pool.query('update draft_runs set clarified_run_id = $2, updated_at = now() where id = $1', [
      draftRunId,
      runId
    ]);
  }
}

function toDraftRun(row: DraftRunRow): DraftRun {
  return {
    id: row.id,
    userId: row.user_id,
    stravaActivityId: row.strava_activity_id ? Number(row.strava_activity_id) : null,
    stravaActivityUrl: row.strava_activity_url,
    activityType: row.activity_type,
    occurredAt: row.occurred_at.toISOString(),
    distanceMeters: row.distance_meters,
    movingTimeSeconds: row.moving_time_seconds,
    elapsedTimeSeconds: row.elapsed_time_seconds,
    title: row.title,
    clarifiedRunId: row.clarified_run_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}
