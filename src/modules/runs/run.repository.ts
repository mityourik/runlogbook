import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { CreateRunInput, Run, UpdateRunInput } from './run.js';

type RunRow = {
  id: string;
  user_id: string;
  occurred_on: string;
  distance_meters: number;
  duration_seconds: number;
  perceived_effort: number | null;
  workout_kind: string | null;
  workout_structure: string | null;
  title: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

export class RunRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateRunInput): Promise<Run> {
    const result = await this.pool.query<RunRow>(
      `insert into runs (
        id,
        user_id,
        occurred_on,
        distance_meters,
        duration_seconds,
        perceived_effort,
        workout_kind,
        workout_structure,
        title,
        notes
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      returning *`,
      [
        randomUUID(),
        input.userId,
        input.occurredOn,
        input.distanceMeters,
        input.durationSeconds,
        input.perceivedEffort ?? null,
        input.workoutKind ?? null,
        input.workoutStructure ?? null,
        input.title ?? null,
        input.notes ?? null
      ]
    );

    return toRun(result.rows[0]);
  }

  async listByUser(userId: string, limit: number, offset: number): Promise<Run[]> {
    const result = await this.pool.query<RunRow>(
      `select *
      from runs
      where user_id = $1
      order by occurred_on desc, created_at desc
      limit $2 offset $3`,
      [userId, limit, offset]
    );

    return result.rows.map(toRun);
  }

  async findById(runId: string): Promise<Run | null> {
    const result = await this.pool.query<RunRow>('select * from runs where id = $1', [runId]);
    const row = result.rows[0];

    return row ? toRun(row) : null;
  }

  async update(runId: string, input: UpdateRunInput): Promise<Run | null> {
    const entries = Object.entries(input) as Array<[keyof UpdateRunInput, string | number | null]>;

    if (entries.length === 0) {
      return this.findById(runId);
    }

    const columnByField: Record<keyof UpdateRunInput, string> = {
      occurredOn: 'occurred_on',
      distanceMeters: 'distance_meters',
      durationSeconds: 'duration_seconds',
      perceivedEffort: 'perceived_effort',
      workoutKind: 'workout_kind',
      workoutStructure: 'workout_structure',
      title: 'title',
      notes: 'notes'
    };

    const assignments = entries.map(([field], index) => `${columnByField[field]} = $${index + 2}`);
    const values = entries.map(([, value]) => value);

    const result = await this.pool.query<RunRow>(
      `update runs
      set ${assignments.join(', ')}, updated_at = now()
      where id = $1
      returning *`,
      [runId, ...values]
    );

    const row = result.rows[0];

    return row ? toRun(row) : null;
  }

  async delete(runId: string): Promise<boolean> {
    const result = await this.pool.query('delete from runs where id = $1', [runId]);

    return result.rowCount === 1;
  }
}

function toRun(row: RunRow): Run {
  return {
    id: row.id,
    userId: row.user_id,
    occurredOn: row.occurred_on,
    distanceMeters: row.distance_meters,
    durationSeconds: row.duration_seconds,
    perceivedEffort: row.perceived_effort,
    workoutKind: row.workout_kind,
    workoutStructure: row.workout_structure,
    title: row.title,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}
