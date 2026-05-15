# Runner Intelligence Context Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Runner Intelligence backend slice: a safe context builder and query endpoint that prepares allowlisted runner facts for LLM-backed coach/data answers.

**Architecture:** Add a new `src/modules/runner-intelligence` module. Keep SQL in `RunnerContextRepository`, context selection in `RunnerContextBuilder`, orchestration in `RunnerIntelligenceService`, and expose it through `POST /runner-intelligence/query`. The MVP uses a deterministic local responder instead of a real LLM provider, but keeps the interface shaped for later LLM integration and enforces the one-tool-call architecture in tests.

**Tech Stack:** Node.js, TypeScript, Fastify, PostgreSQL, Zod, built-in `node:test` through `tsx`.

---

## File Structure

- Modify `package.json`: add `test` script.
- Modify `src/app.ts`: register the new Runner Intelligence routes.
- Create `src/modules/runner-intelligence/runner-intelligence.ts`: shared types for modes, context sections, context packs, LLM responses, and API responses.
- Create `src/modules/runner-intelligence/runner-intelligence.schemas.ts`: Zod schemas for route input and service output validation.
- Create `src/modules/runner-intelligence/question-classifier.ts`: deterministic classifier for MVP question modes.
- Create `src/modules/runner-intelligence/runner-context.repository.ts`: allowlisted SQL queries for context sections.
- Create `src/modules/runner-intelligence/runner-context-builder.ts`: selects and builds context sections from repository methods.
- Create `src/modules/runner-intelligence/context-tool-registry.ts`: validates and executes allowed context tools.
- Create `src/modules/runner-intelligence/runner-intelligence.service.ts`: orchestrates classifier, builder, responder, optional single tool call, and response validation.
- Create `src/modules/runner-intelligence/runner-intelligence.routes.ts`: Fastify route and auth hook.
- Create `src/modules/runner-intelligence/testing/fake-runner-context-repository.ts`: fake repository for builder/service tests.
- Create `src/modules/runner-intelligence/*.test.ts`: unit and integration tests.
- Create `scripts/seed-runner-intelligence-fixture.ts`: manual QA fixture seed script.

Do not remove or rewrite existing `/analytics/*` endpoints in this plan.

---

### Task 1: Add Test Harness

**Files:**
- Modify: `package.json`
- Create: `src/modules/runner-intelligence/question-classifier.test.ts`
- Create: `src/modules/runner-intelligence/question-classifier.ts`

- [ ] **Step 1: Add the test script**

Modify `package.json` scripts to include `test` after `typecheck`:

```json
{
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "web:dev": "vite --host 0.0.0.0",
    "web:build": "vite build",
    "db:migrate": "tsx scripts/migrate.ts",
    "smoke": "tsx scripts/smoke.ts",
    "strava:subscriptions": "tsx scripts/strava-subscriptions.ts",
    "build": "tsc -p tsconfig.json && vite build",
    "start": "node dist/main.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "node --import tsx --test \"src/**/*.test.ts\""
  }
}
```

- [ ] **Step 2: Write the failing classifier test**

Create `src/modules/runner-intelligence/question-classifier.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyRunnerQuestion } from './question-classifier.js';

describe('classifyRunnerQuestion', () => {
  it('classifies factual data lookup questions', () => {
    assert.equal(classifyRunnerQuestion('сколько я пробежал за эту неделю?'), 'data_lookup');
    assert.equal(classifyRunnerQuestion('покажи интервальные за месяц'), 'data_lookup');
  });

  it('classifies broad coaching questions', () => {
    assert.equal(classifyRunnerQuestion('как у меня дела с тренировками?'), 'coach_advice');
    assert.equal(classifyRunnerQuestion('не перегружаюсь ли я?'), 'coach_advice');
  });

  it('classifies plan and workout review questions', () => {
    assert.equal(classifyRunnerQuestion('что делать завтра по плану?'), 'plan_review');
    assert.equal(classifyRunnerQuestion('разбери последнюю интервальную'), 'workout_review');
  });

  it('returns ambiguous for unclear questions', () => {
    assert.equal(classifyRunnerQuestion('ну что?'), 'ambiguous');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/modules/runner-intelligence/question-classifier.test.ts`

Expected: FAIL with module not found for `question-classifier.js`.

- [ ] **Step 4: Implement the minimal classifier**

Create `src/modules/runner-intelligence/question-classifier.ts`:

```ts
export type RunnerQuestionMode =
  | 'data_lookup'
  | 'coach_advice'
  | 'plan_review'
  | 'workout_review'
  | 'onboarding_gap'
  | 'ambiguous';

export function classifyRunnerQuestion(question: string): RunnerQuestionMode {
  const normalized = question.trim().toLowerCase();

  if (/\b(план|завтра|следующ|что делать|plan)\b/u.test(normalized)) {
    return 'plan_review';
  }

  if (/\b(разбери|последн.*интерв|интервальн|тренировк.*детал|workout review)\b/u.test(normalized)) {
    return 'workout_review';
  }

  if (/\b(сколько|покажи|какой|какая|какие|список|пробежал|темп|дистанц|интервальн|за неделю|за месяц)\b/u.test(normalized)) {
    return 'data_lookup';
  }

  if (/\b(как.*дела|перегружа|совет|улучш|готов|устал|восстанов|coach)\b/u.test(normalized)) {
    return 'coach_advice';
  }

  return 'ambiguous';
}
```

- [ ] **Step 5: Run the classifier test**

Run: `npm test -- src/modules/runner-intelligence/question-classifier.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json src/modules/runner-intelligence/question-classifier.ts src/modules/runner-intelligence/question-classifier.test.ts
git commit -m "test: add runner question classifier"
```

---

### Task 2: Define Runner Intelligence Types and Schemas

**Files:**
- Create: `src/modules/runner-intelligence/runner-intelligence.ts`
- Create: `src/modules/runner-intelligence/runner-intelligence.schemas.ts`
- Create: `src/modules/runner-intelligence/runner-intelligence.schemas.test.ts`
- Modify: `src/modules/runner-intelligence/question-classifier.ts`

- [ ] **Step 1: Write the failing schema test**

Create `src/modules/runner-intelligence/runner-intelligence.schemas.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runnerIntelligenceQueryResponseSchema, runnerIntelligenceQuerySchema } from './runner-intelligence.schemas.js';

describe('runner intelligence schemas', () => {
  it('accepts a non-empty question', () => {
    assert.deepEqual(runnerIntelligenceQuerySchema.parse({ question: 'как у меня дела?' }), {
      question: 'как у меня дела?'
    });
  });

  it('rejects empty questions', () => {
    assert.throws(() => runnerIntelligenceQuerySchema.parse({ question: '   ' }), /String must contain/);
  });

  it('accepts the structured response shape', () => {
    const parsed = runnerIntelligenceQueryResponseSchema.parse({
      mode: 'coach_advice',
      answer: 'Данных мало, выводы предварительные.',
      confidence: 'low',
      dataCoverage: {
        runCount: 1,
        weeksCovered: 1,
        hasTrainingPlan: false,
        hasSubjectiveNotes: false,
        hasWorkoutLaps: false
      },
      usedContextSections: ['dataAvailability'],
      facts: [{ label: 'Тренировки', value: '1' }],
      followUpQuestions: ['Какая у тебя цель?']
    });

    assert.equal(parsed.mode, 'coach_advice');
  });
});
```

- [ ] **Step 2: Run the schema test to verify it fails**

Run: `npm test -- src/modules/runner-intelligence/runner-intelligence.schemas.test.ts`

Expected: FAIL with module not found for `runner-intelligence.schemas.js`.

- [ ] **Step 3: Add shared types**

Create `src/modules/runner-intelligence/runner-intelligence.ts`:

```ts
export type RunnerQuestionMode =
  | 'data_lookup'
  | 'coach_advice'
  | 'plan_review'
  | 'workout_review'
  | 'onboarding_gap'
  | 'ambiguous';

export type RunnerIntelligenceConfidence = 'low' | 'medium' | 'high';

export type RunnerContextSectionName =
  | 'dataAvailability'
  | 'recentTrainingSummary'
  | 'recentRuns'
  | 'recentKeyWorkouts'
  | 'currentPlanSnapshot'
  | 'openDrafts'
  | 'questionRelevantFacts'
  | 'workoutDetails';

export type RunnerDataCoverage = {
  runCount: number;
  weeksCovered: number;
  hasTrainingPlan: boolean;
  hasSubjectiveNotes: boolean;
  hasWorkoutLaps: boolean;
};

export type RunnerContextSection = {
  name: RunnerContextSectionName;
  data: unknown;
};

export type RunnerContextPack = {
  userId: string;
  question: string;
  mode: RunnerQuestionMode;
  dataCoverage: RunnerDataCoverage;
  sections: RunnerContextSection[];
};

export type RunnerIntelligenceFact = {
  label?: string;
  value?: string;
  type?: string;
  rows?: unknown[];
};

export type RunnerIntelligenceResponse = {
  mode: RunnerQuestionMode;
  answer: string;
  confidence: RunnerIntelligenceConfidence;
  dataCoverage: RunnerDataCoverage;
  usedContextSections: RunnerContextSectionName[];
  facts: RunnerIntelligenceFact[];
  followUpQuestions: string[];
};

export type RunnerContextToolRequest = {
  name: 'getWorkoutDetails';
  arguments: {
    runId?: string;
  };
};

export type RunnerModelResponse =
  | { type: 'final'; response: RunnerIntelligenceResponse }
  | { type: 'tool_call'; tool: RunnerContextToolRequest };
```

- [ ] **Step 4: Use shared mode type in classifier**

Modify `src/modules/runner-intelligence/question-classifier.ts`:

```ts
import type { RunnerQuestionMode } from './runner-intelligence.js';

export function classifyRunnerQuestion(question: string): RunnerQuestionMode {
  const normalized = question.trim().toLowerCase();

  if (/\b(план|завтра|следующ|что делать|plan)\b/u.test(normalized)) {
    return 'plan_review';
  }

  if (/\b(разбери|последн.*интерв|интервальн|тренировк.*детал|workout review)\b/u.test(normalized)) {
    return 'workout_review';
  }

  if (/\b(сколько|покажи|какой|какая|какие|список|пробежал|темп|дистанц|интервальн|за неделю|за месяц)\b/u.test(normalized)) {
    return 'data_lookup';
  }

  if (/\b(как.*дела|перегружа|совет|улучш|готов|устал|восстанов|coach)\b/u.test(normalized)) {
    return 'coach_advice';
  }

  return 'ambiguous';
}
```

- [ ] **Step 5: Add Zod schemas**

Create `src/modules/runner-intelligence/runner-intelligence.schemas.ts`:

```ts
import { z } from 'zod';

export const runnerQuestionModeSchema = z.enum([
  'data_lookup',
  'coach_advice',
  'plan_review',
  'workout_review',
  'onboarding_gap',
  'ambiguous'
]);

export const runnerContextSectionNameSchema = z.enum([
  'dataAvailability',
  'recentTrainingSummary',
  'recentRuns',
  'recentKeyWorkouts',
  'currentPlanSnapshot',
  'openDrafts',
  'questionRelevantFacts',
  'workoutDetails'
]);

export const runnerIntelligenceQuerySchema = z.object({
  question: z.string().trim().min(1).max(1000)
});

export const runnerDataCoverageSchema = z.object({
  runCount: z.number().int().min(0),
  weeksCovered: z.number().int().min(0),
  hasTrainingPlan: z.boolean(),
  hasSubjectiveNotes: z.boolean(),
  hasWorkoutLaps: z.boolean()
});

export const runnerIntelligenceFactSchema = z.object({
  label: z.string().optional(),
  value: z.string().optional(),
  type: z.string().optional(),
  rows: z.array(z.unknown()).optional()
});

export const runnerIntelligenceQueryResponseSchema = z.object({
  mode: runnerQuestionModeSchema,
  answer: z.string().min(1),
  confidence: z.enum(['low', 'medium', 'high']),
  dataCoverage: runnerDataCoverageSchema,
  usedContextSections: z.array(runnerContextSectionNameSchema),
  facts: z.array(runnerIntelligenceFactSchema).default([]),
  followUpQuestions: z.array(z.string()).default([])
});
```

- [ ] **Step 6: Run schema and classifier tests**

Run: `npm test -- src/modules/runner-intelligence/question-classifier.test.ts src/modules/runner-intelligence/runner-intelligence.schemas.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/runner-intelligence/runner-intelligence.ts src/modules/runner-intelligence/runner-intelligence.schemas.ts src/modules/runner-intelligence/runner-intelligence.schemas.test.ts src/modules/runner-intelligence/question-classifier.ts
git commit -m "feat: define runner intelligence contract"
```

---

### Task 3: Add Runner Context Repository SQL

**Files:**
- Create: `src/modules/runner-intelligence/runner-context.repository.ts`
- Create: `src/modules/runner-intelligence/runner-context.repository.test.ts`

This task assumes the local development PostgreSQL database is available through `DATABASE_URL`. The tests create and clean their own user-specific rows.

- [ ] **Step 1: Write the failing repository test**

Create `src/modules/runner-intelligence/runner-context.repository.test.ts`:

```ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { RunnerContextRepository } from './runner-context.repository.js';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://runlogbook:runlogbook@localhost:5432/runlogbook';
const pool = new pg.Pool({ connectionString: databaseUrl });
const repository = new RunnerContextRepository(pool);

const userId = randomUUID();
const otherUserId = randomUUID();
const draftRunId = randomUUID();
const runId = randomUUID();
const planId = randomUUID();

describe('RunnerContextRepository', () => {
  before(async () => {
    await pool.query(
      `insert into users (id, email, password_hash, display_name)
       values ($1, $2, 'hash', 'Runner'), ($3, $4, 'hash', 'Other')`,
      [userId, `runner-${userId}@example.com`, otherUserId, `other-${otherUserId}@example.com`]
    );
    await pool.query(
      `insert into runs (id, user_id, occurred_on, distance_meters, duration_seconds, perceived_effort, workout_kind, workout_structure, title, notes)
       values
       ($1, $2, '2026-05-01', 10000, 3000, 6, 'easy', null, 'Easy 10k', 'felt smooth'),
       ($3, $2, '2026-05-08', 12000, 3600, 8, 'workout', '6 x 1000', 'Intervals', null),
       ($4, $5, '2026-05-09', 30000, 9000, 7, 'long', null, 'Other long run', null)`,
      [runId, userId, randomUUID(), randomUUID(), otherUserId]
    );
    await pool.query(
      `insert into training_plans (id, user_id, title, starts_on, ends_on)
       values ($1, $2, 'May plan', '2026-05-01', '2026-05-31')`,
      [planId, userId]
    );
    await pool.query(
      `insert into planned_workouts (id, training_plan_id, scheduled_on, title, status)
       values
       ($1, $2, '2026-05-10', 'Easy run', 'completed'),
       ($3, $2, '2026-05-17', 'Long run', 'planned')`,
      [randomUUID(), planId, randomUUID()]
    );
    await pool.query(
      `insert into draft_runs (id, user_id, strava_activity_id, strava_activity_url, activity_type, occurred_at, distance_meters, moving_time_seconds, elapsed_time_seconds, title, raw_activity)
       values ($1, $2, 999001, 'https://www.strava.com/activities/999001', 'Run', '2026-05-15T10:00:00.000Z', 5000, 1500, 1600, 'Draft run', '{}')`,
      [draftRunId, userId]
    );
    await pool.query(
      `insert into workout_laps (id, user_id, draft_run_id, strava_activity_id, lap_number, lap_kind, distance_meters, moving_time_seconds, elapsed_time_seconds, raw_lap)
       values ($1, $2, $3, 999001, 1, 'work', 1000, 220, 225, '{}')`,
      [randomUUID(), userId, draftRunId]
    );
  });

  after(async () => {
    await pool.query('delete from users where id = any($1::uuid[])', [[userId, otherUserId]]);
    await pool.end();
  });

  it('summarizes data availability for one user only', async () => {
    const availability = await repository.getDataAvailability(userId);

    assert.equal(availability.runCount, 2);
    assert.equal(availability.weeksCovered, 2);
    assert.equal(availability.hasTrainingPlan, true);
    assert.equal(availability.hasSubjectiveNotes, true);
    assert.equal(availability.hasWorkoutLaps, true);
    assert.equal(availability.hasOpenDrafts, true);
  });

  it('returns weekly rollups and recent key workouts', async () => {
    const rollups = await repository.getRecentTrainingSummary(userId, '2026-04-20', '2026-05-17');
    const keyWorkouts = await repository.getRecentKeyWorkouts(userId, 10);

    assert.equal(rollups.at(-1)?.runCount, 1);
    assert.equal(keyWorkouts.length, 1);
    assert.equal(keyWorkouts[0].title, 'Intervals');
  });

  it('returns current plan snapshot and open drafts', async () => {
    const plan = await repository.getCurrentPlanSnapshot(userId, '2026-05-15');
    const drafts = await repository.getOpenDrafts(userId);

    assert.equal(plan?.title, 'May plan');
    assert.equal(plan?.plannedCount, 2);
    assert.equal(plan?.completedCount, 1);
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].hasWorkoutLaps, true);
  });
});
```

- [ ] **Step 2: Run the repository test to verify it fails**

Run: `npm test -- src/modules/runner-intelligence/runner-context.repository.test.ts`

Expected: FAIL with module not found for `runner-context.repository.js`.

- [ ] **Step 3: Implement the repository**

Create `src/modules/runner-intelligence/runner-context.repository.ts`:

```ts
import type { Pool } from 'pg';

export type DataAvailabilityContext = {
  runCount: number;
  firstRunOn: string | null;
  latestRunOn: string | null;
  weeksCovered: number;
  hasTrainingPlan: boolean;
  hasPlannedWorkouts: boolean;
  hasWorkoutLaps: boolean;
  hasOpenDrafts: boolean;
  hasSubjectiveNotes: boolean;
};

export type WeeklyTrainingRollup = {
  weekStart: string;
  runCount: number;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  longestRunMeters: number;
  averageEffort: number | null;
};

export type RecentRunContext = {
  id: string;
  occurredOn: string;
  title: string | null;
  distanceMeters: number;
  durationSeconds: number;
  perceivedEffort: number | null;
  workoutKind: string | null;
  notesPreview: string | null;
};

export type CurrentPlanSnapshot = {
  id: string;
  title: string;
  startsOn: string;
  endsOn: string | null;
  plannedCount: number;
  completedCount: number;
  changedCount: number;
  skippedCount: number;
  upcomingWorkouts: Array<{
    id: string;
    scheduledOn: string;
    title: string;
    status: string;
    targetDistanceMeters: number | null;
    targetDurationSeconds: number | null;
  }>;
};

export type OpenDraftContext = {
  id: string;
  stravaActivityId: number | null;
  title: string | null;
  occurredAt: string;
  distanceMeters: number;
  movingTimeSeconds: number;
  hasWorkoutLaps: boolean;
  hasLapsNeedingReview: boolean;
};

export type WorkoutDetailsContext = RecentRunContext & {
  notes: string | null;
  workoutStructure: string | null;
};

type AvailabilityRow = {
  run_count: string;
  first_run_on: string | null;
  latest_run_on: string | null;
  weeks_covered: number | null;
  has_training_plan: boolean;
  has_planned_workouts: boolean;
  has_workout_laps: boolean;
  has_open_drafts: boolean;
  has_subjective_notes: boolean;
};

type WeeklyRollupRow = {
  week_start: string;
  run_count: string;
  total_distance_meters: string;
  total_duration_seconds: string;
  longest_run_meters: number;
  average_effort: string | null;
};

type RunContextRow = {
  id: string;
  occurred_on: string;
  title: string | null;
  distance_meters: number;
  duration_seconds: number;
  perceived_effort: number | null;
  workout_kind: string | null;
  workout_structure: string | null;
  notes: string | null;
};

type PlanRow = {
  id: string;
  title: string;
  starts_on: string;
  ends_on: string | null;
  planned_count: string;
  completed_count: string;
  changed_count: string;
  skipped_count: string;
};

type UpcomingWorkoutRow = {
  id: string;
  scheduled_on: string;
  title: string;
  status: string;
  target_distance_meters: number | null;
  target_duration_seconds: number | null;
};

type DraftRow = {
  id: string;
  strava_activity_id: string | null;
  title: string | null;
  occurred_at: Date;
  distance_meters: number;
  moving_time_seconds: number;
  has_workout_laps: boolean;
  has_laps_needing_review: boolean;
};

export class RunnerContextRepository {
  constructor(private readonly pool: Pool) {}

  async getDataAvailability(userId: string): Promise<DataAvailabilityContext> {
    const result = await this.pool.query<AvailabilityRow>(
      `select
        count(r.*) as run_count,
        min(r.occurred_on) as first_run_on,
        max(r.occurred_on) as latest_run_on,
        case
          when min(r.occurred_on) is null then 0
          else floor((max(r.occurred_on) - min(r.occurred_on)) / 7) + 1
        end as weeks_covered,
        exists(select 1 from training_plans tp where tp.user_id = $1) as has_training_plan,
        exists(
          select 1
          from training_plans tp
          join planned_workouts pw on pw.training_plan_id = tp.id
          where tp.user_id = $1
        ) as has_planned_workouts,
        exists(select 1 from workout_laps wl where wl.user_id = $1) as has_workout_laps,
        exists(select 1 from draft_runs dr where dr.user_id = $1 and dr.clarified_run_id is null) as has_open_drafts,
        exists(select 1 from runs rn where rn.user_id = $1 and (rn.notes is not null or rn.perceived_effort is not null)) as has_subjective_notes
      from runs r
      where r.user_id = $1`,
      [userId]
    );

    const row = result.rows[0];

    return {
      runCount: Number(row.run_count),
      firstRunOn: row.first_run_on,
      latestRunOn: row.latest_run_on,
      weeksCovered: row.weeks_covered ?? 0,
      hasTrainingPlan: row.has_training_plan,
      hasPlannedWorkouts: row.has_planned_workouts,
      hasWorkoutLaps: row.has_workout_laps,
      hasOpenDrafts: row.has_open_drafts,
      hasSubjectiveNotes: row.has_subjective_notes
    };
  }

  async getRecentTrainingSummary(userId: string, startDate: string, endDate: string): Promise<WeeklyTrainingRollup[]> {
    const result = await this.pool.query<WeeklyRollupRow>(
      `select
        date_trunc('week', occurred_on)::date as week_start,
        count(*) as run_count,
        coalesce(sum(distance_meters), 0) as total_distance_meters,
        coalesce(sum(duration_seconds), 0) as total_duration_seconds,
        coalesce(max(distance_meters), 0) as longest_run_meters,
        avg(perceived_effort) as average_effort
      from runs
      where user_id = $1 and occurred_on >= $2 and occurred_on <= $3
      group by week_start
      order by week_start`,
      [userId, startDate, endDate]
    );

    return result.rows.map((row) => ({
      weekStart: row.week_start,
      runCount: Number(row.run_count),
      totalDistanceMeters: Number(row.total_distance_meters),
      totalDurationSeconds: Number(row.total_duration_seconds),
      longestRunMeters: row.longest_run_meters,
      averageEffort: row.average_effort ? Number(Number(row.average_effort).toFixed(1)) : null
    }));
  }

  async getRecentRuns(userId: string, limit: number): Promise<RecentRunContext[]> {
    const result = await this.pool.query<RunContextRow>(
      `select id, occurred_on, title, distance_meters, duration_seconds, perceived_effort, workout_kind, workout_structure, notes
      from runs
      where user_id = $1
      order by occurred_on desc, created_at desc
      limit $2`,
      [userId, limit]
    );

    return result.rows.map(toRecentRunContext);
  }

  async getRecentKeyWorkouts(userId: string, limit: number): Promise<RecentRunContext[]> {
    const result = await this.pool.query<RunContextRow>(
      `select id, occurred_on, title, distance_meters, duration_seconds, perceived_effort, workout_kind, workout_structure, notes
      from runs
      where user_id = $1 and workout_kind in ('workout', 'long', 'race')
      order by occurred_on desc, created_at desc
      limit $2`,
      [userId, limit]
    );

    return result.rows.map(toRecentRunContext);
  }

  async getCurrentPlanSnapshot(userId: string, onDate: string): Promise<CurrentPlanSnapshot | null> {
    const planResult = await this.pool.query<PlanRow>(
      `select tp.id,
        tp.title,
        tp.starts_on,
        tp.ends_on,
        count(pw.*) as planned_count,
        count(pw.*) filter (where pw.status = 'completed') as completed_count,
        count(pw.*) filter (where pw.status = 'changed') as changed_count,
        count(pw.*) filter (where pw.status = 'skipped') as skipped_count
      from training_plans tp
      left join planned_workouts pw on pw.training_plan_id = tp.id
      where tp.user_id = $1
        and tp.starts_on <= $2
        and (tp.ends_on is null or tp.ends_on >= $2)
      group by tp.id
      order by tp.starts_on desc, tp.created_at desc
      limit 1`,
      [userId, onDate]
    );
    const plan = planResult.rows[0];

    if (!plan) {
      return null;
    }

    const upcomingResult = await this.pool.query<UpcomingWorkoutRow>(
      `select id, scheduled_on, title, status, target_distance_meters, target_duration_seconds
      from planned_workouts
      where training_plan_id = $1 and scheduled_on >= $2
      order by scheduled_on asc, created_at asc
      limit 5`,
      [plan.id, onDate]
    );

    return {
      id: plan.id,
      title: plan.title,
      startsOn: plan.starts_on,
      endsOn: plan.ends_on,
      plannedCount: Number(plan.planned_count),
      completedCount: Number(plan.completed_count),
      changedCount: Number(plan.changed_count),
      skippedCount: Number(plan.skipped_count),
      upcomingWorkouts: upcomingResult.rows.map((row) => ({
        id: row.id,
        scheduledOn: row.scheduled_on,
        title: row.title,
        status: row.status,
        targetDistanceMeters: row.target_distance_meters,
        targetDurationSeconds: row.target_duration_seconds
      }))
    };
  }

  async getOpenDrafts(userId: string): Promise<OpenDraftContext[]> {
    const result = await this.pool.query<DraftRow>(
      `select dr.id,
        dr.strava_activity_id,
        dr.title,
        dr.occurred_at,
        dr.distance_meters,
        dr.moving_time_seconds,
        exists(select 1 from workout_laps wl where wl.draft_run_id = dr.id) as has_workout_laps,
        exists(select 1 from workout_laps wl where wl.draft_run_id = dr.id and wl.needs_review) as has_laps_needing_review
      from draft_runs dr
      where dr.user_id = $1 and dr.clarified_run_id is null
      order by dr.occurred_at desc`,
      [userId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      stravaActivityId: row.strava_activity_id ? Number(row.strava_activity_id) : null,
      title: row.title,
      occurredAt: row.occurred_at.toISOString(),
      distanceMeters: row.distance_meters,
      movingTimeSeconds: row.moving_time_seconds,
      hasWorkoutLaps: row.has_workout_laps,
      hasLapsNeedingReview: row.has_laps_needing_review
    }));
  }

  async getWorkoutDetails(userId: string, runId: string): Promise<WorkoutDetailsContext | null> {
    const result = await this.pool.query<RunContextRow>(
      `select id, occurred_on, title, distance_meters, duration_seconds, perceived_effort, workout_kind, workout_structure, notes
      from runs
      where user_id = $1 and id = $2`,
      [userId, runId]
    );
    const row = result.rows[0];

    return row ? { ...toRecentRunContext(row), notes: row.notes, workoutStructure: row.workout_structure } : null;
  }
}

function toRecentRunContext(row: RunContextRow): RecentRunContext {
  return {
    id: row.id,
    occurredOn: row.occurred_on,
    title: row.title,
    distanceMeters: row.distance_meters,
    durationSeconds: row.duration_seconds,
    perceivedEffort: row.perceived_effort,
    workoutKind: row.workout_kind,
    notesPreview: row.notes ? row.notes.slice(0, 160) : null
  };
}
```

- [ ] **Step 4: Run the repository test**

Run: `npm test -- src/modules/runner-intelligence/runner-context.repository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/runner-intelligence/runner-context.repository.ts src/modules/runner-intelligence/runner-context.repository.test.ts
git commit -m "feat: add runner context repository"
```

---

### Task 4: Build Context Packs

**Files:**
- Create: `src/modules/runner-intelligence/runner-context-builder.ts`
- Create: `src/modules/runner-intelligence/runner-context-builder.test.ts`
- Create: `src/modules/runner-intelligence/testing/fake-runner-context-repository.ts`

- [ ] **Step 1: Write the fake repository**

Create `src/modules/runner-intelligence/testing/fake-runner-context-repository.ts`:

```ts
import type {
  CurrentPlanSnapshot,
  DataAvailabilityContext,
  OpenDraftContext,
  RecentRunContext,
  WeeklyTrainingRollup,
  WorkoutDetailsContext
} from '../runner-context.repository.js';

export class FakeRunnerContextRepository {
  dataAvailability: DataAvailabilityContext = {
    runCount: 0,
    firstRunOn: null,
    latestRunOn: null,
    weeksCovered: 0,
    hasTrainingPlan: false,
    hasPlannedWorkouts: false,
    hasWorkoutLaps: false,
    hasOpenDrafts: false,
    hasSubjectiveNotes: false
  };
  recentTrainingSummary: WeeklyTrainingRollup[] = [];
  recentRuns: RecentRunContext[] = [];
  recentKeyWorkouts: RecentRunContext[] = [];
  currentPlanSnapshot: CurrentPlanSnapshot | null = null;
  openDrafts: OpenDraftContext[] = [];
  workoutDetails: WorkoutDetailsContext | null = null;

  async getDataAvailability(): Promise<DataAvailabilityContext> {
    return this.dataAvailability;
  }

  async getRecentTrainingSummary(): Promise<WeeklyTrainingRollup[]> {
    return this.recentTrainingSummary;
  }

  async getRecentRuns(): Promise<RecentRunContext[]> {
    return this.recentRuns;
  }

  async getRecentKeyWorkouts(): Promise<RecentRunContext[]> {
    return this.recentKeyWorkouts;
  }

  async getCurrentPlanSnapshot(): Promise<CurrentPlanSnapshot | null> {
    return this.currentPlanSnapshot;
  }

  async getOpenDrafts(): Promise<OpenDraftContext[]> {
    return this.openDrafts;
  }

  async getWorkoutDetails(): Promise<WorkoutDetailsContext | null> {
    return this.workoutDetails;
  }
}
```

- [ ] **Step 2: Write the failing builder test**

Create `src/modules/runner-intelligence/runner-context-builder.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RunnerContextBuilder } from './runner-context-builder.js';
import { FakeRunnerContextRepository } from './testing/fake-runner-context-repository.js';

describe('RunnerContextBuilder', () => {
  it('always includes data availability and marks no-run context as onboarding gap', async () => {
    const repository = new FakeRunnerContextRepository();
    const builder = new RunnerContextBuilder(repository);

    const pack = await builder.buildBaseContext({
      userId: 'user-1',
      question: 'как у меня дела?',
      mode: 'coach_advice',
      now: new Date('2026-05-15T12:00:00.000Z')
    });

    assert.equal(pack.mode, 'onboarding_gap');
    assert.deepEqual(pack.sections.map((section) => section.name), ['dataAvailability']);
  });

  it('adds training, key workouts, plan, and drafts for coach context when available', async () => {
    const repository = new FakeRunnerContextRepository();
    repository.dataAvailability = {
      runCount: 12,
      firstRunOn: '2026-04-01',
      latestRunOn: '2026-05-15',
      weeksCovered: 7,
      hasTrainingPlan: true,
      hasPlannedWorkouts: true,
      hasWorkoutLaps: true,
      hasOpenDrafts: true,
      hasSubjectiveNotes: true
    };
    repository.recentTrainingSummary = [{
      weekStart: '2026-05-11',
      runCount: 4,
      totalDistanceMeters: 42000,
      totalDurationSeconds: 12600,
      longestRunMeters: 18000,
      averageEffort: 6.5
    }];
    repository.recentKeyWorkouts = [{
      id: 'run-1',
      occurredOn: '2026-05-14',
      title: 'Intervals',
      distanceMeters: 12000,
      durationSeconds: 3600,
      perceivedEffort: 8,
      workoutKind: 'workout',
      notesPreview: 'hard but controlled'
    }];
    repository.currentPlanSnapshot = {
      id: 'plan-1',
      title: 'May plan',
      startsOn: '2026-05-01',
      endsOn: '2026-05-31',
      plannedCount: 10,
      completedCount: 4,
      changedCount: 1,
      skippedCount: 0,
      upcomingWorkouts: []
    };
    repository.openDrafts = [{
      id: 'draft-1',
      stravaActivityId: 123,
      title: 'Draft',
      occurredAt: '2026-05-15T10:00:00.000Z',
      distanceMeters: 5000,
      movingTimeSeconds: 1500,
      hasWorkoutLaps: false,
      hasLapsNeedingReview: false
    }];
    const builder = new RunnerContextBuilder(repository);

    const pack = await builder.buildBaseContext({
      userId: 'user-1',
      question: 'как у меня дела?',
      mode: 'coach_advice',
      now: new Date('2026-05-15T12:00:00.000Z')
    });

    assert.deepEqual(pack.sections.map((section) => section.name), [
      'dataAvailability',
      'recentTrainingSummary',
      'recentKeyWorkouts',
      'currentPlanSnapshot',
      'openDrafts'
    ]);
  });

  it('builds narrow facts for data lookup questions', async () => {
    const repository = new FakeRunnerContextRepository();
    repository.dataAvailability = {
      runCount: 2,
      firstRunOn: '2026-05-01',
      latestRunOn: '2026-05-08',
      weeksCovered: 2,
      hasTrainingPlan: false,
      hasPlannedWorkouts: false,
      hasWorkoutLaps: false,
      hasOpenDrafts: false,
      hasSubjectiveNotes: false
    };
    repository.recentRuns = [{
      id: 'run-1',
      occurredOn: '2026-05-08',
      title: 'Easy run',
      distanceMeters: 10000,
      durationSeconds: 3000,
      perceivedEffort: null,
      workoutKind: 'easy',
      notesPreview: null
    }];
    const builder = new RunnerContextBuilder(repository);

    const pack = await builder.buildBaseContext({
      userId: 'user-1',
      question: 'сколько я пробежал за неделю?',
      mode: 'data_lookup',
      now: new Date('2026-05-15T12:00:00.000Z')
    });

    assert.deepEqual(pack.sections.map((section) => section.name), ['dataAvailability', 'recentRuns', 'questionRelevantFacts']);
  });
});
```

- [ ] **Step 3: Run the builder test to verify it fails**

Run: `npm test -- src/modules/runner-intelligence/runner-context-builder.test.ts`

Expected: FAIL with module not found for `runner-context-builder.js`.

- [ ] **Step 4: Implement the builder**

Create `src/modules/runner-intelligence/runner-context-builder.ts`:

```ts
import type { RunnerContextPack, RunnerContextSection, RunnerQuestionMode } from './runner-intelligence.js';
import type { RunnerContextRepository } from './runner-context.repository.js';

type RunnerContextRepositoryLike = Pick<
  RunnerContextRepository,
  | 'getDataAvailability'
  | 'getRecentTrainingSummary'
  | 'getRecentRuns'
  | 'getRecentKeyWorkouts'
  | 'getCurrentPlanSnapshot'
  | 'getOpenDrafts'
>;

export class RunnerContextBuilder {
  constructor(private readonly repository: RunnerContextRepositoryLike) {}

  async buildBaseContext(input: {
    userId: string;
    question: string;
    mode: RunnerQuestionMode;
    now?: Date;
  }): Promise<RunnerContextPack> {
    const now = input.now ?? new Date();
    const today = toIsoDate(now);
    const availability = await this.repository.getDataAvailability(input.userId);
    const mode = availability.runCount === 0 ? 'onboarding_gap' : input.mode;
    const sections: RunnerContextSection[] = [{ name: 'dataAvailability', data: availability }];

    if (mode === 'data_lookup') {
      const recentRuns = await this.repository.getRecentRuns(input.userId, 20);
      sections.push({ name: 'recentRuns', data: recentRuns });
      sections.push({ name: 'questionRelevantFacts', data: buildQuestionRelevantFacts(input.question, recentRuns) });
    }

    if (mode === 'coach_advice' || mode === 'plan_review') {
      sections.push({
        name: 'recentTrainingSummary',
        data: await this.repository.getRecentTrainingSummary(input.userId, toIsoDate(addDays(now, -55)), today)
      });
      sections.push({ name: 'recentKeyWorkouts', data: await this.repository.getRecentKeyWorkouts(input.userId, 10) });

      if (availability.hasTrainingPlan) {
        const plan = await this.repository.getCurrentPlanSnapshot(input.userId, today);
        if (plan) {
          sections.push({ name: 'currentPlanSnapshot', data: plan });
        }
      }

      if (availability.hasOpenDrafts) {
        sections.push({ name: 'openDrafts', data: await this.repository.getOpenDrafts(input.userId) });
      }
    }

    if (mode === 'workout_review') {
      sections.push({ name: 'recentKeyWorkouts', data: await this.repository.getRecentKeyWorkouts(input.userId, 5) });
    }

    return {
      userId: input.userId,
      question: input.question,
      mode,
      dataCoverage: {
        runCount: availability.runCount,
        weeksCovered: availability.weeksCovered,
        hasTrainingPlan: availability.hasTrainingPlan,
        hasSubjectiveNotes: availability.hasSubjectiveNotes,
        hasWorkoutLaps: availability.hasWorkoutLaps
      },
      sections
    };
  }
}

function buildQuestionRelevantFacts(question: string, recentRuns: Array<{ distanceMeters: number }>): unknown {
  const normalized = question.toLowerCase();
  const totalDistanceMeters = recentRuns.reduce((total, run) => total + run.distanceMeters, 0);

  return {
    questionKind: /сколько|дистанц|пробежал/u.test(normalized) ? 'distance' : 'recent_runs',
    recentRunCount: recentRuns.length,
    recentTotalDistanceMeters: totalDistanceMeters
  };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);

  return next;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
```

- [ ] **Step 5: Run the builder test**

Run: `npm test -- src/modules/runner-intelligence/runner-context-builder.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/runner-intelligence/runner-context-builder.ts src/modules/runner-intelligence/runner-context-builder.test.ts src/modules/runner-intelligence/testing/fake-runner-context-repository.ts
git commit -m "feat: build runner context packs"
```

---

### Task 5: Add Context Tool Registry

**Files:**
- Create: `src/modules/runner-intelligence/context-tool-registry.ts`
- Create: `src/modules/runner-intelligence/context-tool-registry.test.ts`

- [ ] **Step 1: Write the failing tool registry test**

Create `src/modules/runner-intelligence/context-tool-registry.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ContextToolRegistry } from './context-tool-registry.js';
import { FakeRunnerContextRepository } from './testing/fake-runner-context-repository.js';

describe('ContextToolRegistry', () => {
  it('executes getWorkoutDetails for an allowed run id', async () => {
    const repository = new FakeRunnerContextRepository();
    repository.workoutDetails = {
      id: 'run-1',
      occurredOn: '2026-05-08',
      title: 'Intervals',
      distanceMeters: 12000,
      durationSeconds: 3600,
      perceivedEffort: 8,
      workoutKind: 'workout',
      notesPreview: 'hard',
      notes: 'hard but controlled',
      workoutStructure: '6 x 1000'
    };
    const registry = new ContextToolRegistry(repository);

    const section = await registry.execute('user-1', { name: 'getWorkoutDetails', arguments: { runId: 'run-1' } });

    assert.equal(section.name, 'workoutDetails');
    assert.deepEqual((section.data as { id: string }).id, 'run-1');
  });

  it('rejects missing run id', async () => {
    const registry = new ContextToolRegistry(new FakeRunnerContextRepository());

    await assert.rejects(
      () => registry.execute('user-1', { name: 'getWorkoutDetails', arguments: {} }),
      /runId is required/
    );
  });
});
```

- [ ] **Step 2: Run the registry test to verify it fails**

Run: `npm test -- src/modules/runner-intelligence/context-tool-registry.test.ts`

Expected: FAIL with module not found for `context-tool-registry.js`.

- [ ] **Step 3: Implement the registry**

Create `src/modules/runner-intelligence/context-tool-registry.ts`:

```ts
import type { RunnerContextSection, RunnerContextToolRequest } from './runner-intelligence.js';
import type { RunnerContextRepository } from './runner-context.repository.js';

type ToolRepository = Pick<RunnerContextRepository, 'getWorkoutDetails'>;

export class ContextToolRegistry {
  constructor(private readonly repository: ToolRepository) {}

  async execute(userId: string, tool: RunnerContextToolRequest): Promise<RunnerContextSection> {
    if (tool.name === 'getWorkoutDetails') {
      const runId = tool.arguments.runId;

      if (!runId) {
        throw new Error('runId is required for getWorkoutDetails');
      }

      const details = await this.repository.getWorkoutDetails(userId, runId);

      return { name: 'workoutDetails', data: details };
    }

    const neverTool: never = tool.name;
    throw new Error(`Unsupported context tool: ${neverTool}`);
  }
}
```

- [ ] **Step 4: Run the registry test**

Run: `npm test -- src/modules/runner-intelligence/context-tool-registry.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/runner-intelligence/context-tool-registry.ts src/modules/runner-intelligence/context-tool-registry.test.ts
git commit -m "feat: add runner context tool registry"
```

---

### Task 6: Add Runner Intelligence Service

**Files:**
- Create: `src/modules/runner-intelligence/runner-intelligence.service.ts`
- Create: `src/modules/runner-intelligence/runner-intelligence.service.test.ts`

- [ ] **Step 1: Write the failing service test**

Create `src/modules/runner-intelligence/runner-intelligence.service.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RunnerContextPack, RunnerModelResponse } from './runner-intelligence.js';
import { RunnerContextBuilder } from './runner-context-builder.js';
import { ContextToolRegistry } from './context-tool-registry.js';
import { RunnerIntelligenceService, type RunnerModelResponder } from './runner-intelligence.service.js';
import { FakeRunnerContextRepository } from './testing/fake-runner-context-repository.js';

class ScriptedResponder implements RunnerModelResponder {
  calls: RunnerContextPack[] = [];

  constructor(private readonly responses: RunnerModelResponse[]) {}

  async respond(context: RunnerContextPack): Promise<RunnerModelResponse> {
    this.calls.push(context);
    const response = this.responses.shift();
    if (!response) throw new Error('No scripted response');
    return response;
  }
}

describe('RunnerIntelligenceService', () => {
  it('returns onboarding gap when there are no runs', async () => {
    const repository = new FakeRunnerContextRepository();
    const service = new RunnerIntelligenceService({
      builder: new RunnerContextBuilder(repository),
      tools: new ContextToolRegistry(repository),
      responder: new ScriptedResponder([])
    });

    const response = await service.answer({ userId: 'user-1', question: 'как у меня дела?' });

    assert.equal(response.mode, 'onboarding_gap');
    assert.equal(response.confidence, 'low');
    assert.match(response.answer, /пока нет сохраненных тренировок/);
  });

  it('allows one context tool call before final response', async () => {
    const repository = new FakeRunnerContextRepository();
    repository.dataAvailability = {
      runCount: 3,
      firstRunOn: '2026-05-01',
      latestRunOn: '2026-05-10',
      weeksCovered: 2,
      hasTrainingPlan: false,
      hasPlannedWorkouts: false,
      hasWorkoutLaps: false,
      hasOpenDrafts: false,
      hasSubjectiveNotes: true
    };
    repository.recentKeyWorkouts = [{
      id: 'run-1',
      occurredOn: '2026-05-10',
      title: 'Intervals',
      distanceMeters: 12000,
      durationSeconds: 3600,
      perceivedEffort: 8,
      workoutKind: 'workout',
      notesPreview: 'hard'
    }];
    repository.workoutDetails = {
      ...repository.recentKeyWorkouts[0],
      notes: 'hard but controlled',
      workoutStructure: '6 x 1000'
    };
    const responder = new ScriptedResponder([
      { type: 'tool_call', tool: { name: 'getWorkoutDetails', arguments: { runId: 'run-1' } } },
      {
        type: 'final',
        response: {
          mode: 'workout_review',
          answer: 'Последняя интервальная была тяжелой, но контролируемой.',
          confidence: 'medium',
          dataCoverage: {
            runCount: 3,
            weeksCovered: 2,
            hasTrainingPlan: false,
            hasSubjectiveNotes: true,
            hasWorkoutLaps: false
          },
          usedContextSections: ['dataAvailability', 'recentKeyWorkouts', 'workoutDetails'],
          facts: [],
          followUpQuestions: []
        }
      }
    ]);
    const service = new RunnerIntelligenceService({
      builder: new RunnerContextBuilder(repository),
      tools: new ContextToolRegistry(repository),
      responder
    });

    const response = await service.answer({ userId: 'user-1', question: 'разбери последнюю интервальную' });

    assert.equal(response.answer, 'Последняя интервальная была тяжелой, но контролируемой.');
    assert.equal(responder.calls.length, 2);
    assert.equal(responder.calls[1].sections.at(-1)?.name, 'workoutDetails');
  });
});
```

- [ ] **Step 2: Run the service test to verify it fails**

Run: `npm test -- src/modules/runner-intelligence/runner-intelligence.service.test.ts`

Expected: FAIL with module not found for `runner-intelligence.service.js`.

- [ ] **Step 3: Implement the service**

Create `src/modules/runner-intelligence/runner-intelligence.service.ts`:

```ts
import { classifyRunnerQuestion } from './question-classifier.js';
import type { ContextToolRegistry } from './context-tool-registry.js';
import type { RunnerContextBuilder } from './runner-context-builder.js';
import type { RunnerContextPack, RunnerIntelligenceResponse, RunnerModelResponse } from './runner-intelligence.js';
import { runnerIntelligenceQueryResponseSchema } from './runner-intelligence.schemas.js';

export type RunnerModelResponder = {
  respond(context: RunnerContextPack): Promise<RunnerModelResponse>;
};

export class LocalRunnerModelResponder implements RunnerModelResponder {
  async respond(context: RunnerContextPack): Promise<RunnerModelResponse> {
    if (context.mode === 'data_lookup') {
      return { type: 'final', response: buildDataLookupResponse(context) };
    }

    return { type: 'final', response: buildCoachResponse(context) };
  }
}

export class RunnerIntelligenceService {
  constructor(
    private readonly dependencies: {
      builder: RunnerContextBuilder;
      tools: ContextToolRegistry;
      responder: RunnerModelResponder;
    }
  ) {}

  async answer(input: { userId: string; question: string; now?: Date }): Promise<RunnerIntelligenceResponse> {
    const mode = classifyRunnerQuestion(input.question);
    const context = await this.dependencies.builder.buildBaseContext({
      userId: input.userId,
      question: input.question,
      mode,
      now: input.now
    });

    if (context.mode === 'onboarding_gap') {
      return buildOnboardingGapResponse(context);
    }

    const firstResponse = await this.dependencies.responder.respond(context);

    if (firstResponse.type === 'final') {
      return runnerIntelligenceQueryResponseSchema.parse(firstResponse.response);
    }

    const section = await this.dependencies.tools.execute(input.userId, firstResponse.tool);
    const secondContext: RunnerContextPack = { ...context, sections: [...context.sections, section] };
    const secondResponse = await this.dependencies.responder.respond(secondContext);

    if (secondResponse.type !== 'final') {
      throw new Error('Only one additional context tool call is allowed');
    }

    return runnerIntelligenceQueryResponseSchema.parse(secondResponse.response);
  }
}

function buildOnboardingGapResponse(context: RunnerContextPack): RunnerIntelligenceResponse {
  return {
    mode: 'onboarding_gap',
    answer: 'У меня пока нет сохраненных тренировок, поэтому я не могу надежно анализировать подготовку. Подключи Strava или добавь первую тренировку, а также цель или план.',
    confidence: 'low',
    dataCoverage: context.dataCoverage,
    usedContextSections: context.sections.map((section) => section.name),
    facts: [],
    followUpQuestions: ['Какая у тебя ближайшая беговая цель?', 'Есть ли у тебя текущий тренировочный план?']
  };
}

function buildDataLookupResponse(context: RunnerContextPack): RunnerIntelligenceResponse {
  return {
    mode: context.mode,
    answer: `Нашел ${context.dataCoverage.runCount} сохраненных тренировок. Показываю факты из доступной истории.`,
    confidence: context.dataCoverage.runCount >= 3 ? 'high' : 'low',
    dataCoverage: context.dataCoverage,
    usedContextSections: context.sections.map((section) => section.name),
    facts: context.sections
      .filter((section) => section.name === 'questionRelevantFacts')
      .map((section) => ({ type: section.name, rows: [section.data] })),
    followUpQuestions: []
  };
}

function buildCoachResponse(context: RunnerContextPack): RunnerIntelligenceResponse {
  const lowData = context.dataCoverage.runCount < 4;

  return {
    mode: context.mode,
    answer: lowData
      ? 'Данных пока мало, поэтому выводы предварительные. Я могу осторожно смотреть на последние тренировки, но для надежных советов нужна более длинная история.'
      : 'Я собрал недавнюю историю, ключевые тренировки и плановый контекст. Можно использовать это как основу для тренерского ответа.',
    confidence: lowData ? 'low' : 'medium',
    dataCoverage: context.dataCoverage,
    usedContextSections: context.sections.map((section) => section.name),
    facts: [],
    followUpQuestions: lowData ? ['Какая у тебя цель на ближайшие 4-8 недель?'] : []
  };
}
```

- [ ] **Step 4: Run the service test**

Run: `npm test -- src/modules/runner-intelligence/runner-intelligence.service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/runner-intelligence/runner-intelligence.service.ts src/modules/runner-intelligence/runner-intelligence.service.test.ts
git commit -m "feat: orchestrate runner intelligence responses"
```

---

### Task 7: Add API Route

**Files:**
- Create: `src/modules/runner-intelligence/runner-intelligence.routes.ts`
- Create: `src/modules/runner-intelligence/runner-intelligence.routes.test.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Write the failing route test**

Create `src/modules/runner-intelligence/runner-intelligence.routes.test.ts`:

```ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { buildApp } from '../../app.js';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://runlogbook:runlogbook@localhost:5432/runlogbook';
const pool = new pg.Pool({ connectionString: databaseUrl });
const userId = randomUUID();
const token = `runner-intelligence-${randomUUID()}`;

describe('runner intelligence routes', () => {
  before(async () => {
    await pool.query(`insert into users (id, email, password_hash, display_name) values ($1, $2, 'hash', 'Runner')`, [
      userId,
      `ri-${userId}@example.com`
    ]);
    await pool.query(
      `insert into sessions (id, user_id, token_hash, expires_at)
       values ($1, $2, encode(sha256($3::bytea), 'hex'), now() + interval '1 day')`,
      [randomUUID(), userId, token]
    );
  });

  after(async () => {
    await pool.query('delete from users where id = $1', [userId]);
    await pool.end();
  });

  it('requires auth', async () => {
    const app = await buildApp({ pool });
    const response = await app.inject({ method: 'POST', url: '/runner-intelligence/query', payload: { question: 'как дела?' } });
    await app.close();

    assert.equal(response.statusCode, 401);
  });

  it('returns a structured response for an authenticated query', async () => {
    const app = await buildApp({ pool });
    const response = await app.inject({
      method: 'POST',
      url: '/runner-intelligence/query',
      headers: { authorization: `Bearer ${token}` },
      payload: { question: 'как у меня дела?' }
    });
    await app.close();

    assert.equal(response.statusCode, 200);
    const body = response.json<{ mode: string; dataCoverage: { runCount: number }; usedContextSections: string[] }>();
    assert.equal(body.mode, 'onboarding_gap');
    assert.equal(body.dataCoverage.runCount, 0);
    assert.deepEqual(body.usedContextSections, ['dataAvailability']);
  });
});
```

- [ ] **Step 2: Run the route test to verify it fails**

Run: `npm test -- src/modules/runner-intelligence/runner-intelligence.routes.test.ts`

Expected: FAIL with 404 for `/runner-intelligence/query` or module not found for route file.

- [ ] **Step 3: Add the route**

Create `src/modules/runner-intelligence/runner-intelligence.routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { authenticateRequest } from '../identity/auth.js';
import { ContextToolRegistry } from './context-tool-registry.js';
import { RunnerContextBuilder } from './runner-context-builder.js';
import { RunnerContextRepository } from './runner-context.repository.js';
import { runnerIntelligenceQuerySchema } from './runner-intelligence.schemas.js';
import { LocalRunnerModelResponder, RunnerIntelligenceService } from './runner-intelligence.service.js';

export function registerRunnerIntelligenceRoutes(app: FastifyInstance): void {
  const repository = new RunnerContextRepository(app.dependencies.pool);
  const service = new RunnerIntelligenceService({
    builder: new RunnerContextBuilder(repository),
    tools: new ContextToolRegistry(repository),
    responder: new LocalRunnerModelResponder()
  });

  app.addHook('preHandler', async (request) => {
    if (!request.url.startsWith('/runner-intelligence')) {
      return;
    }

    const user = await authenticateRequest(request);

    if (!user) {
      throw app.httpErrors.unauthorized('Missing or invalid bearer token');
    }

    request.user = user;
  });

  app.post('/runner-intelligence/query', async (request) => {
    const input = runnerIntelligenceQuerySchema.parse(request.body);

    return service.answer({ userId: request.user!.id, question: input.question });
  });
}
```

- [ ] **Step 4: Register the route in app**

Modify `src/app.ts`:

```ts
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { registerAnalyticsRoutes } from './modules/analytics/analytics.routes.js';
import { registerHealthRoutes } from './modules/health/health.routes.js';
import { registerAuthRoutes } from './modules/identity/auth.routes.js';
import { registerStravaRoutes } from './modules/integrations/strava/strava.routes.js';
import { registerNotificationRoutes } from './modules/notifications/notification.routes.js';
import { registerRunRoutes } from './modules/runs/run.routes.js';
import { registerRunnerIntelligenceRoutes } from './modules/runner-intelligence/runner-intelligence.routes.js';
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
  registerRunnerIntelligenceRoutes(app);
  registerTrainingPlanRoutes(app);
  registerRunRoutes(app);

  return app;
}
```

- [ ] **Step 5: Run the route test**

Run: `npm test -- src/modules/runner-intelligence/runner-intelligence.routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app.ts src/modules/runner-intelligence/runner-intelligence.routes.ts src/modules/runner-intelligence/runner-intelligence.routes.test.ts
git commit -m "feat: expose runner intelligence query endpoint"
```

---

### Task 8: Add Manual QA Fixture Seed

**Files:**
- Create: `scripts/seed-runner-intelligence-fixture.ts`
- Modify: `package.json`

- [ ] **Step 1: Add the seed script command**

Modify `package.json` scripts to include:

```json
{
  "scripts": {
    "runner-intelligence:seed": "tsx scripts/seed-runner-intelligence-fixture.ts"
  }
}
```

Keep all existing scripts.

- [ ] **Step 2: Create the seed script**

Create `scripts/seed-runner-intelligence-fixture.ts`:

```ts
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { env } from '../src/shared/config/env.js';

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const email = `runner-intelligence-${Date.now()}@example.com`;
const userId = randomUUID();
const planId = randomUUID();
const draftRunId = randomUUID();

await pool.query('begin');

try {
  await pool.query(`insert into users (id, email, password_hash, display_name) values ($1, $2, 'manual-seed', 'Runner Intelligence Fixture')`, [
    userId,
    email
  ]);

  const runs = [
    ['2026-04-06', 8000, 2460, 5, 'easy', null, 'Easy run', 'felt easy'],
    ['2026-04-09', 11000, 3300, 8, 'workout', '5 x 1000', 'Intervals', 'hard but controlled'],
    ['2026-04-13', 16000, 5100, 6, 'long', null, 'Long run', null],
    ['2026-04-20', 9000, 2700, 5, 'easy', null, 'Easy run', null],
    ['2026-04-23', 12000, 3600, 8, 'workout', '3 x 2000', 'Tempo intervals', 'good rhythm'],
    ['2026-04-27', 18000, 5700, 7, 'long', null, 'Long run', 'tired late'],
    ['2026-05-04', 10000, 3000, 5, 'easy', null, 'Easy 10k', null],
    ['2026-05-08', 13000, 3900, 9, 'workout', '6 x 1000', 'Track intervals', 'very hard'],
    ['2026-05-11', 7000, 2160, 4, 'easy', null, 'Recovery run', 'fresh'],
    ['2026-05-14', 12000, 3600, 8, 'workout', '10 x 600', '10 x 600', 'controlled']
  ] as const;

  for (const run of runs) {
    await pool.query(
      `insert into runs (id, user_id, occurred_on, distance_meters, duration_seconds, perceived_effort, workout_kind, workout_structure, title, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [randomUUID(), userId, ...run]
    );
  }

  await pool.query(`insert into training_plans (id, user_id, title, starts_on, ends_on) values ($1, $2, 'May 10k build', '2026-05-01', '2026-05-31')`, [
    planId,
    userId
  ]);

  for (const workout of [
    ['2026-05-11', 'Recovery run', 'completed'],
    ['2026-05-14', '10 x 600', 'completed'],
    ['2026-05-17', 'Long run 18k', 'planned'],
    ['2026-05-20', 'Tempo 6k', 'planned']
  ] as const) {
    await pool.query(
      `insert into planned_workouts (id, training_plan_id, scheduled_on, title, status)
       values ($1, $2, $3, $4, $5)`,
      [randomUUID(), planId, ...workout]
    );
  }

  await pool.query(
    `insert into draft_runs (id, user_id, strava_activity_id, strava_activity_url, activity_type, occurred_at, distance_meters, moving_time_seconds, elapsed_time_seconds, title, raw_activity)
     values ($1, $2, 424242, 'https://www.strava.com/activities/424242', 'Run', '2026-05-15T17:30:00.000Z', 5000, 1500, 1550, 'Unclarified evening run', '{}')`,
    [draftRunId, userId]
  );

  await pool.query(
    `insert into workout_laps (id, user_id, draft_run_id, strava_activity_id, lap_number, lap_kind, distance_meters, moving_time_seconds, elapsed_time_seconds, raw_lap)
     values ($1, $2, $3, 424242, 1, 'work', 1000, 220, 225, '{}')`,
    [randomUUID(), userId, draftRunId]
  );

  await pool.query('commit');
  console.log(JSON.stringify({ userId, email }, null, 2));
} catch (error) {
  await pool.query('rollback');
  throw error;
} finally {
  await pool.end();
}
```

- [ ] **Step 3: Run the seed script**

Run: `npm run runner-intelligence:seed`

Expected: PASS and prints JSON containing `userId` and `email`.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/seed-runner-intelligence-fixture.ts
git commit -m "chore: seed runner intelligence QA fixture"
```

---

### Task 9: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: PASS with all runner intelligence tests passing.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: PASS with TypeScript and Vite build succeeding.

- [ ] **Step 4: Run smoke test**

Run: `npm run smoke`

Expected: PASS and prints `Smoke test passed`.

- [ ] **Step 5: Manual endpoint check**

Start API if it is not running:

```bash
npm run dev
```

In another terminal, register or login, then call:

```bash
curl -s -X POST http://localhost:3000/runner-intelligence/query \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"question":"как у меня дела?"}'
```

Expected: JSON response with `mode`, `answer`, `confidence`, `dataCoverage`, `usedContextSections`, `facts`, and `followUpQuestions`.

- [ ] **Step 6: Commit final verification note if docs changed**

If final verification required documentation changes, commit them:

```bash
git add docs package.json src scripts
git commit -m "docs: document runner intelligence verification"
```

If no files changed after verification, do not create an empty commit.
