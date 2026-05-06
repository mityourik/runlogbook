import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { PlannedWorkout, PlannedWorkoutStatus, TrainingPlan } from './training-plan.js';

type TrainingPlanRow = {
  id: string;
  user_id: string;
  title: string;
  starts_on: string;
  ends_on: string | null;
  created_at: Date;
};

type PlannedWorkoutRow = {
  id: string;
  training_plan_id: string;
  scheduled_on: string;
  title: string;
  target_distance_meters: number | null;
  target_duration_seconds: number | null;
  status: PlannedWorkoutStatus;
  completed_run_id: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

export class TrainingPlanRepository {
  constructor(private readonly pool: Pool) {}

  async createPlan(input: { userId: string; title: string; startsOn: string; endsOn?: string }): Promise<TrainingPlan> {
    const result = await this.pool.query<TrainingPlanRow>(
      `insert into training_plans (id, user_id, title, starts_on, ends_on)
      values ($1, $2, $3, $4, $5)
      returning *`,
      [randomUUID(), input.userId, input.title, input.startsOn, input.endsOn ?? null]
    );

    return toTrainingPlan(result.rows[0]);
  }

  async findCurrentPlan(userId: string, onDate: string): Promise<TrainingPlan | null> {
    const result = await this.pool.query<TrainingPlanRow>(
      `select *
      from training_plans
      where user_id = $1
        and starts_on <= $2
        and (ends_on is null or ends_on >= $2)
      order by starts_on desc, created_at desc
      limit 1`,
      [userId, onDate]
    );
    const row = result.rows[0];

    return row ? toTrainingPlan(row) : null;
  }

  async findPlanById(planId: string): Promise<TrainingPlan | null> {
    const result = await this.pool.query<TrainingPlanRow>('select * from training_plans where id = $1', [planId]);
    const row = result.rows[0];

    return row ? toTrainingPlan(row) : null;
  }

  async addWorkout(input: {
    trainingPlanId: string;
    scheduledOn: string;
    title: string;
    targetDistanceMeters?: number;
    targetDurationSeconds?: number;
    notes?: string;
  }): Promise<PlannedWorkout> {
    const result = await this.pool.query<PlannedWorkoutRow>(
      `insert into planned_workouts (
        id,
        training_plan_id,
        scheduled_on,
        title,
        target_distance_meters,
        target_duration_seconds,
        notes
      ) values ($1, $2, $3, $4, $5, $6, $7)
      returning *`,
      [
        randomUUID(),
        input.trainingPlanId,
        input.scheduledOn,
        input.title,
        input.targetDistanceMeters ?? null,
        input.targetDurationSeconds ?? null,
        input.notes ?? null
      ]
    );

    return toPlannedWorkout(result.rows[0]);
  }

  async listWorkouts(trainingPlanId: string): Promise<PlannedWorkout[]> {
    const result = await this.pool.query<PlannedWorkoutRow>(
      `select *
      from planned_workouts
      where training_plan_id = $1
      order by scheduled_on asc, created_at asc`,
      [trainingPlanId]
    );

    return result.rows.map(toPlannedWorkout);
  }

  async findWorkoutById(workoutId: string): Promise<PlannedWorkout | null> {
    const result = await this.pool.query<PlannedWorkoutRow>('select * from planned_workouts where id = $1', [workoutId]);
    const row = result.rows[0];

    return row ? toPlannedWorkout(row) : null;
  }

  async updateWorkout(
    workoutId: string,
    input: Partial<{
      scheduledOn: string;
      title: string;
      targetDistanceMeters: number | null;
      targetDurationSeconds: number | null;
      status: PlannedWorkoutStatus;
      completedRunId: string | null;
      notes: string | null;
    }>
  ): Promise<PlannedWorkout | null> {
    const entries = Object.entries(input) as Array<[keyof typeof input, string | number | null]>;

    if (entries.length === 0) {
      return this.findWorkoutById(workoutId);
    }

    const columnByField: Record<keyof typeof input, string> = {
      scheduledOn: 'scheduled_on',
      title: 'title',
      targetDistanceMeters: 'target_distance_meters',
      targetDurationSeconds: 'target_duration_seconds',
      status: 'status',
      completedRunId: 'completed_run_id',
      notes: 'notes'
    };
    const assignments = entries.map(([field], index) => `${columnByField[field]} = $${index + 2}`);
    const values = entries.map(([, value]) => value);

    const result = await this.pool.query<PlannedWorkoutRow>(
      `update planned_workouts
      set ${assignments.join(', ')}, updated_at = now()
      where id = $1
      returning *`,
      [workoutId, ...values]
    );
    const row = result.rows[0];

    return row ? toPlannedWorkout(row) : null;
  }
}

function toTrainingPlan(row: TrainingPlanRow): TrainingPlan {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    createdAt: row.created_at.toISOString()
  };
}

function toPlannedWorkout(row: PlannedWorkoutRow): PlannedWorkout {
  return {
    id: row.id,
    trainingPlanId: row.training_plan_id,
    scheduledOn: row.scheduled_on,
    title: row.title,
    targetDistanceMeters: row.target_distance_meters,
    targetDurationSeconds: row.target_duration_seconds,
    status: row.status,
    completedRunId: row.completed_run_id,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}
