import type { FastifyInstance } from 'fastify';

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/health/db', async () => {
    await app.dependencies.pool.query('select 1');
    return { status: 'ok' };
  });
}
