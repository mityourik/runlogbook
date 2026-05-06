import { buildApp } from './app.js';
import { env } from './shared/config/env.js';
import { createPostgresPool } from './shared/infrastructure/postgres.js';

const pool = createPostgresPool(env.DATABASE_URL);
const app = await buildApp({ pool });

const shutdown = async () => {
  await app.close();
  await pool.end();
};

process.on('SIGINT', () => {
  void shutdown().then(() => process.exit(0));
});

process.on('SIGTERM', () => {
  void shutdown().then(() => process.exit(0));
});

await app.listen({ host: '0.0.0.0', port: env.PORT });
