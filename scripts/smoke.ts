import { buildApp } from '../src/app.js';
import { createPostgresPool } from '../src/shared/infrastructure/postgres.js';
import { env } from '../src/shared/config/env.js';

const pool = createPostgresPool(env.DATABASE_URL);
const app = await buildApp({ pool });
const email = `smoke-${Date.now()}@example.com`;

const registerResponse = await app.inject({
  method: 'POST',
  url: '/auth/register',
  payload: {
    email,
    password: 'very-secure-password',
    displayName: 'Smoke Runner'
  }
});

assertStatus(registerResponse.statusCode, 201, 'register');
const registerBody = registerResponse.json<{ token: string }>();

const meResponse = await app.inject({
  method: 'GET',
  url: '/me',
  headers: { authorization: `Bearer ${registerBody.token}` }
});

assertStatus(meResponse.statusCode, 200, 'me');

const createRunResponse = await app.inject({
  method: 'POST',
  url: '/runs',
  headers: { authorization: `Bearer ${registerBody.token}` },
  payload: {
    occurredOn: '2026-05-06',
    distanceMeters: 5000,
    durationSeconds: 1500,
    perceivedEffort: 6,
    title: 'Smoke run',
    notes: 'API smoke test'
  }
});

assertStatus(createRunResponse.statusCode, 201, 'create run');

const listRunsResponse = await app.inject({
  method: 'GET',
  url: '/runs',
  headers: { authorization: `Bearer ${registerBody.token}` }
});

assertStatus(listRunsResponse.statusCode, 200, 'list runs');

const notificationsResponse = await app.inject({
  method: 'GET',
  url: '/notifications',
  headers: { authorization: `Bearer ${registerBody.token}` }
});

assertStatus(notificationsResponse.statusCode, 200, 'list notifications');

const createPlanResponse = await app.inject({
  method: 'POST',
  url: '/training-plans',
  headers: { authorization: `Bearer ${registerBody.token}` },
  payload: {
    title: 'Smoke plan',
    startsOn: '2026-05-01',
    endsOn: '2026-05-31'
  }
});

assertStatus(createPlanResponse.statusCode, 201, 'create training plan');
const createPlanBody = createPlanResponse.json<{ plan: { id: string } }>();

const createWorkoutResponse = await app.inject({
  method: 'POST',
  url: `/training-plans/${createPlanBody.plan.id}/workouts`,
  headers: { authorization: `Bearer ${registerBody.token}` },
  payload: {
    scheduledOn: '2026-05-07',
    title: 'Easy 5k',
    targetDistanceMeters: 5000
  }
});

assertStatus(createWorkoutResponse.statusCode, 201, 'create planned workout');

const currentPlanResponse = await app.inject({
  method: 'GET',
  url: '/training-plans/current',
  headers: { authorization: `Bearer ${registerBody.token}` }
});

assertStatus(currentPlanResponse.statusCode, 200, 'current training plan');

const weeklySummaryResponse = await app.inject({
  method: 'GET',
  url: '/analytics/weekly-summary?weekStart=2026-05-04',
  headers: { authorization: `Bearer ${registerBody.token}` }
});

assertStatus(weeklySummaryResponse.statusCode, 200, 'weekly summary');

const planAdherenceResponse = await app.inject({
  method: 'GET',
  url: '/analytics/plan-adherence',
  headers: { authorization: `Bearer ${registerBody.token}` }
});

assertStatus(planAdherenceResponse.statusCode, 200, 'plan adherence');

await app.close();
await pool.end();

console.log('Smoke test passed');

function assertStatus(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} failed: expected ${expected}, got ${actual}`);
  }
}
