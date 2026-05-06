import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { registerAnalyticsRoutes } from './modules/analytics/analytics.routes.js';
import { registerHealthRoutes } from './modules/health/health.routes.js';
import { registerAuthRoutes } from './modules/identity/auth.routes.js';
import { registerStravaRoutes } from './modules/integrations/strava/strava.routes.js';
import { registerNotificationRoutes } from './modules/notifications/notification.routes.js';
import { registerRunRoutes } from './modules/runs/run.routes.js';
import { registerTrainingPlanRoutes } from './modules/training-plans/training-plan.routes.js';

export type AppDependencies = {
  pool: Pool;
};

export async function buildApp(dependencies: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(sensible);

  app.decorate('dependencies', dependencies);

  registerHealthRoutes(app);
  registerAnalyticsRoutes(app);
  registerAuthRoutes(app);
  registerStravaRoutes(app);
  registerNotificationRoutes(app);
  registerTrainingPlanRoutes(app);
  registerRunRoutes(app);

  return app;
}
