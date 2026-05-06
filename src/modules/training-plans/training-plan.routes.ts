import type { FastifyInstance } from 'fastify';
import { authenticateRequest } from '../identity/auth.js';
import { TrainingPlanRepository } from './training-plan.repository.js';
import {
  addPlannedWorkoutSchema,
  createTrainingPlanSchema,
  plannedWorkoutParamsSchema,
  trainingPlanParamsSchema,
  updatePlannedWorkoutSchema
} from './training-plan.schemas.js';

export function registerTrainingPlanRoutes(app: FastifyInstance): void {
  const plans = new TrainingPlanRepository(app.dependencies.pool);

  app.addHook('preHandler', async (request) => {
    if (!request.url.startsWith('/training-plans') && !request.url.startsWith('/planned-workouts')) {
      return;
    }

    const user = await authenticateRequest(request);

    if (!user) {
      throw app.httpErrors.unauthorized('Missing or invalid bearer token');
    }

    request.user = user;
  });

  app.post('/training-plans', async (request, reply) => {
    const input = createTrainingPlanSchema.parse(request.body);
    const plan = await plans.createPlan({ ...input, userId: request.user!.id });

    return reply.code(201).send({ plan });
  });

  app.get('/training-plans/current', async (request) => {
    const today = new Date().toISOString().slice(0, 10);
    const plan = await plans.findCurrentPlan(request.user!.id, today);
    const workouts = plan ? await plans.listWorkouts(plan.id) : [];

    return { plan, workouts };
  });

  app.post('/training-plans/:planId/workouts', async (request, reply) => {
    const { planId } = trainingPlanParamsSchema.parse(request.params);
    const plan = await plans.findPlanById(planId);

    if (!plan || plan.userId !== request.user!.id) {
      throw app.httpErrors.notFound('Training plan not found');
    }

    const input = addPlannedWorkoutSchema.parse(request.body);
    const workout = await plans.addWorkout({ ...input, trainingPlanId: plan.id });

    return reply.code(201).send({ workout });
  });

  app.patch('/planned-workouts/:workoutId', async (request) => {
    const { workoutId } = plannedWorkoutParamsSchema.parse(request.params);
    const workout = await plans.findWorkoutById(workoutId);

    if (!workout) {
      throw app.httpErrors.notFound('Planned workout not found');
    }

    const plan = await plans.findPlanById(workout.trainingPlanId);

    if (!plan || plan.userId !== request.user!.id) {
      throw app.httpErrors.notFound('Planned workout not found');
    }

    const input = updatePlannedWorkoutSchema.parse(request.body);
    const updatedWorkout = await plans.updateWorkout(workout.id, input);

    return { workout: updatedWorkout };
  });
}
