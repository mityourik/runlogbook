import type { FastifyInstance } from 'fastify';
import { env } from '../../shared/config/env.js';
import { authenticateRequest } from '../identity/auth.js';
import { LlmAnalyticsClassifier } from './analytics-llm-classifier.js';
import { AnalyticsQueryExecutor } from './analytics-query-executor.js';
import { AnalyticsQueryService } from './analytics-query.service.js';
import { AnalyticsRepository } from './analytics.repository.js';
import { analyticsQueryRequestSchema, distanceSummaryQuerySchema, weeklySummaryQuerySchema } from './analytics.schemas.js';

export function registerAnalyticsRoutes(app: FastifyInstance): void {
  const analytics = new AnalyticsRepository(app.dependencies.pool);
  const executor = new AnalyticsQueryExecutor(analytics);
  const llmClassifier = new LlmAnalyticsClassifier({
    endpoint: env.ANALYTICS_LLM_ENDPOINT,
    apiKey: env.ANALYTICS_LLM_API_KEY,
    model: env.ANALYTICS_LLM_MODEL
  });
  const queryService = new AnalyticsQueryService(executor, llmClassifier);

  app.addHook('preHandler', async (request) => {
    if (!request.url.startsWith('/analytics')) {
      return;
    }

    const user = await authenticateRequest(request);

    if (!user) {
      throw app.httpErrors.unauthorized('Missing or invalid bearer token');
    }

    request.user = user;
  });

  app.post('/analytics/query', async (request) => {
    const input = analyticsQueryRequestSchema.parse(request.body);

    return queryService.query({ userId: request.user!.id, ...input });
  });

  app.get('/analytics/weekly-summary', async (request) => {
    const query = weeklySummaryQuerySchema.parse(request.query);
    const weekStart = query.weekStart ?? getCurrentWeekStart();
    const weekEnd = addDays(weekStart, 6);
    const summary = await analytics.getWeeklySummary({ userId: request.user!.id, weekStart, weekEnd });

    return { summary };
  });

  app.get('/analytics/plan-adherence', async (request) => {
    const today = new Date().toISOString().slice(0, 10);
    const adherence = await analytics.getCurrentPlanAdherence(request.user!.id, today);

    return { adherence };
  });

  app.get('/analytics/distance', async (request) => {
    const query = distanceSummaryQuerySchema.parse(request.query);
    const summary = await analytics.getDistanceSummary({
      userId: request.user!.id,
      startDate: query.startDate,
      endDate: query.endDate
    });

    return { summary };
  });
}

function getCurrentWeekStart(): string {
  const date = new Date();
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);

  return date.toISOString().slice(0, 10);
}

function addDays(dateValue: string, days: number): string {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}
