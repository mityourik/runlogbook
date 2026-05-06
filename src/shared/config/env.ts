import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url().default('postgres://runlogbook:runlogbook@localhost:5432/runlogbook'),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  APP_SECRET: z.string().min(32).default('development-secret-change-before-prod'),
  STRAVA_CLIENT_ID: z.string().optional(),
  STRAVA_CLIENT_SECRET: z.string().optional(),
  STRAVA_WEBHOOK_VERIFY_TOKEN: z.string().default('development-strava-webhook-token')
});

export const env = envSchema.parse(process.env);
