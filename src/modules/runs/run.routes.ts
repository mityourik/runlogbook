import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { authenticateRequest } from '../identity/auth.js';
import { TrainingPlanRepository } from '../training-plans/training-plan.repository.js';
import { DraftRunRepository } from './draft-run.repository.js';
import { RunRepository } from './run.repository.js';
import { WorkoutLapRepository } from './workout-lap.repository.js';
import {
  clarifyDraftRunSchema,
  createRunSchema,
  draftRunParamsSchema,
  listRunsQuerySchema,
  runParamsSchema,
  updateRunSchema
} from './run.schemas.js';

export function registerRunRoutes(app: FastifyInstance): void {
  const repository = new RunRepository(app.dependencies.pool);
  const draftRuns = new DraftRunRepository(app.dependencies.pool);
  const workoutLaps = new WorkoutLapRepository(app.dependencies.pool);
  const trainingPlans = new TrainingPlanRepository(app.dependencies.pool);

  app.addHook('preHandler', async (request) => {
    if (!request.url.startsWith('/runs')) {
      return;
    }

    const user = await authenticateRequest(request);

    if (!user) {
      throw app.httpErrors.unauthorized('Missing or invalid bearer token');
    }

    request.user = user;
  });

  app.post('/runs', async (request, reply) => {
    const input = createRunSchema.parse(request.body);
    const run = await repository.create({ ...input, userId: request.user!.id });

    return reply.code(201).send({ run });
  });

  app.get('/runs', async (request) => {
    const query = listRunsQuerySchema.parse(request.query);
    const runs = await repository.listByUser(request.user!.id, query.limit, query.offset);

    return { runs };
  });

  app.get('/runs/drafts', async (request) => {
    const runs = await draftRuns.listOpenByUser(request.user!.id);
    const laps = await workoutLaps.listByDraftRunIds(runs.map((run) => run.id));
    const lapsByDraftRunId = new Map<string, typeof laps>();

    for (const lap of laps) {
      lapsByDraftRunId.set(lap.draftRunId, [...(lapsByDraftRunId.get(lap.draftRunId) ?? []), lap]);
    }

    return {
      draftRuns: runs.map((run) => ({
        ...run,
        workoutLaps: lapsByDraftRunId.get(run.id) ?? []
      }))
    };
  });

  app.post('/runs/drafts/:draftRunId/clarify', async (request, reply) => {
    const { draftRunId } = draftRunParamsSchema.parse(request.params);
    const input = clarifyDraftRunSchema.parse(request.body);
    if (input.plannedWorkoutId) {
      const plannedWorkout = await trainingPlans.findWorkoutById(input.plannedWorkoutId);
      const plan = plannedWorkout ? await trainingPlans.findPlanById(plannedWorkout.trainingPlanId) : null;

      if (!plannedWorkout || !plan || plan.userId !== request.user!.id) {
        throw app.httpErrors.notFound('Planned workout not found');
      }
    }

    const client = await app.dependencies.pool.connect();
    let committed = false;

    try {
      await client.query('begin');

      const draftResult = await client.query<{
        id: string;
        user_id: string;
        occurred_at: Date;
        distance_meters: number;
        moving_time_seconds: number;
        title: string | null;
        clarified_run_id: string | null;
      }>('select * from draft_runs where id = $1 for update', [draftRunId]);
      const draftRun = draftResult.rows[0];

      if (!draftRun || draftRun.user_id !== request.user!.id || draftRun.clarified_run_id) {
        throw app.httpErrors.notFound('Draft run not found');
      }

      const occurredOn = input.occurredOn ?? draftRun.occurred_at.toISOString().slice(0, 10);
      const distanceMeters = input.distanceMeters ?? draftRun.distance_meters;
      const durationSeconds = input.durationSeconds ?? draftRun.moving_time_seconds;

      if (distanceMeters <= 0) {
        throw app.httpErrors.badRequest('Distance is required for a finalized run');
      }

      if (durationSeconds <= 0) {
        throw app.httpErrors.badRequest('Duration is required for a finalized run');
      }

      const runId = randomUUID();
      const runResult = await client.query<{
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
      }>(
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
          runId,
          request.user!.id,
          occurredOn,
          distanceMeters,
          durationSeconds,
          input.perceivedEffort,
          input.workoutKind,
          input.workoutStructure ?? null,
          input.title ?? draftRun.title,
          input.notes ?? null
        ]
      );

      await client.query('update draft_runs set clarified_run_id = $2, updated_at = now() where id = $1', [
        draftRun.id,
        runId
      ]);

      await client.query('commit');
      committed = true;

      const runRow = runResult.rows[0];
      const run = {
        id: runRow.id,
        userId: runRow.user_id,
        occurredOn: runRow.occurred_on,
        distanceMeters: runRow.distance_meters,
        durationSeconds: runRow.duration_seconds,
        perceivedEffort: runRow.perceived_effort,
        workoutKind: runRow.workout_kind,
        workoutStructure: runRow.workout_structure,
        title: runRow.title,
        notes: runRow.notes,
        createdAt: runRow.created_at.toISOString(),
        updatedAt: runRow.updated_at.toISOString()
      };

      const intervalDistanceMeters = input.workoutStructure ? parseIntervalDistanceMeters(input.workoutStructure) : null;

      if (input.workoutKind === 'workout' && intervalDistanceMeters) {
        await workoutLaps.correctWorkLapDistances({
          draftRunId: draftRun.id,
          correctedDistanceMeters: intervalDistanceMeters,
          tolerancePercent: 10,
          lapCorrections: input.workoutLapCorrections
        });
      }

      if (input.plannedWorkoutId) {
        await trainingPlans.updateWorkout(input.plannedWorkoutId, {
          status: input.plannedWorkoutStatus,
          completedRunId: run.id
        });
      }

      return reply.code(201).send({ run });
    } catch (error) {
      if (!committed) {
        await client.query('rollback');
      }
      throw error;
    } finally {
      client.release();
    }
  });

  app.get('/runs/:runId', async (request, reply) => {
    const { runId } = runParamsSchema.parse(request.params);
    const run = await repository.findById(runId);

    if (!run || run.userId !== request.user!.id) {
      throw app.httpErrors.notFound('Run not found');
    }

    return reply.send({ run });
  });

  app.patch('/runs/:runId', async (request, reply) => {
    const { runId } = runParamsSchema.parse(request.params);
    const input = updateRunSchema.parse(request.body);
    const existingRun = await repository.findById(runId);

    if (!existingRun || existingRun.userId !== request.user!.id) {
      throw app.httpErrors.notFound('Run not found');
    }

    const run = await repository.update(runId, input);

    return reply.send({ run });
  });

  app.delete('/runs/:runId', async (request, reply) => {
    const { runId } = runParamsSchema.parse(request.params);
    const existingRun = await repository.findById(runId);

    if (!existingRun || existingRun.userId !== request.user!.id) {
      throw app.httpErrors.notFound('Run not found');
    }

    const deleted = await repository.delete(runId);

    if (!deleted) {
      throw app.httpErrors.notFound('Run not found');
    }

    return reply.code(204).send();
  });
}

function parseIntervalDistanceMeters(value: string): number | null {
  const match = value.toLowerCase().match(/(?:\d+\s*[xх]\s*)?(\d+(?:[.,]\d+)?)\s*(км|km|м|m)?/u);

  if (!match) {
    return null;
  }

  const amount = Number(match[1].replace(',', '.'));
  const unit = match[2] ?? 'м';

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(unit === 'км' || unit === 'km' ? amount * 1000 : amount);
}
