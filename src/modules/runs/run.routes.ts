import type { FastifyInstance } from 'fastify';
import { authenticateRequest } from '../identity/auth.js';
import { TrainingPlanRepository } from '../training-plans/training-plan.repository.js';
import { DraftRunRepository } from './draft-run.repository.js';
import { RunRepository } from './run.repository.js';
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

    return { draftRuns: runs };
  });

  app.post('/runs/drafts/:draftRunId/clarify', async (request, reply) => {
    const { draftRunId } = draftRunParamsSchema.parse(request.params);
    const input = clarifyDraftRunSchema.parse(request.body);
    const draftRun = await draftRuns.findById(draftRunId);

    if (!draftRun || draftRun.userId !== request.user!.id || draftRun.clarifiedRunId) {
      throw app.httpErrors.notFound('Draft run not found');
    }

    if (input.plannedWorkoutId) {
      const plannedWorkout = await trainingPlans.findWorkoutById(input.plannedWorkoutId);
      const plan = plannedWorkout ? await trainingPlans.findPlanById(plannedWorkout.trainingPlanId) : null;

      if (!plannedWorkout || !plan || plan.userId !== request.user!.id) {
        throw app.httpErrors.notFound('Planned workout not found');
      }
    }

    const occurredOn = input.occurredOn ?? draftRun.occurredAt.slice(0, 10);
    const distanceMeters = input.distanceMeters ?? draftRun.distanceMeters;
    const durationSeconds = input.durationSeconds ?? draftRun.movingTimeSeconds;

    if (distanceMeters <= 0) {
      throw app.httpErrors.badRequest('Distance is required for a finalized run');
    }

    if (durationSeconds <= 0) {
      throw app.httpErrors.badRequest('Duration is required for a finalized run');
    }

    const run = await repository.create({
      userId: request.user!.id,
      occurredOn,
      distanceMeters,
      durationSeconds,
      perceivedEffort: input.perceivedEffort,
      title: input.title ?? draftRun.title ?? undefined,
      notes: input.notes
    });

    await draftRuns.markClarified(draftRun.id, run.id);

    if (input.plannedWorkoutId) {
      await trainingPlans.updateWorkout(input.plannedWorkoutId, {
        status: input.plannedWorkoutStatus,
        completedRunId: run.id
      });
    }

    return reply.code(201).send({ run });
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
