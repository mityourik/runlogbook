# Analytics Query Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe hybrid natural-language analytics router that maps user questions to allowlisted analytics queries and returns structured data only.

**Architecture:** Add a new `POST /analytics/query` endpoint inside the existing analytics module. The endpoint runs deterministic rules first, falls back to an LLM classifier that can only return allowlisted intents, resolves periods, and executes predefined repository methods. The UI switches from client-side period parsing to this backend query contract and supports clarification options.

**Tech Stack:** Node.js, TypeScript, Fastify, PostgreSQL, Zod, React, Vite, built-in `node:test` run through `tsx`.

---

## File Structure

Create these focused analytics files:

- `src/modules/analytics/analytics-intents.ts`: intent names, parameter types, catalog entries, period values, and Zod schemas for classified intents.
- `src/modules/analytics/analytics-periods.ts`: resolves period names and explicit dates into concrete date ranges.
- `src/modules/analytics/analytics-rule-classifier.ts`: deterministic Russian-language rules for frequent questions.
- `src/modules/analytics/analytics-llm-classifier.ts`: OpenAI-compatible LLM adapter using `fetch`, strict JSON parsing, and allowlist validation.
- `src/modules/analytics/analytics-query-executor.ts`: maps validated intents to `AnalyticsRepository` methods.
- `src/modules/analytics/analytics-clarification.ts`: builds 2-3 executable clarification options.
- `src/modules/analytics/analytics-query.service.ts`: orchestrates rules, LLM fallback, clarification, period resolution, and execution.
- `src/modules/analytics/*.test.ts`: unit tests for periods, rules, LLM validation, executor, and service behavior.

Modify existing files:

- `package.json`: add `test` script.
- `src/shared/config/env.ts`: add optional LLM env vars.
- `src/modules/analytics/analytics.schemas.ts`: add request/response schemas for `POST /analytics/query`.
- `src/modules/analytics/analytics.repository.ts`: add explicit repository methods for missing analytics intents.
- `src/modules/analytics/analytics.routes.ts`: register `POST /analytics/query`.
- `web/src/api.ts`: add analytics query request/response types and client function.
- `web/src/App.tsx`: replace client-side period parsing path with the new endpoint and render multiple results or clarification options.

Do not modify database schema unless implementation discovers an existing column is missing. Current schema already includes `runs.workout_kind`, `runs.workout_structure`, `planned_workouts.completed_run_id`, and `workout_laps`.

---

### Task 1: Add Test Harness

**Files:**
- Modify: `package.json`
- Create: `src/modules/analytics/analytics-periods.test.ts`
- Create: `src/modules/analytics/analytics-periods.ts`

- [ ] **Step 1: Add the test script**

Modify `package.json` scripts to include `test`:

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

- [ ] **Step 2: Write the failing period resolver test**

Create `src/modules/analytics/analytics-periods.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveAnalyticsPeriod } from './analytics-periods.js';

describe('resolveAnalyticsPeriod', () => {
  const today = new Date('2026-05-15T12:00:00.000Z');

  it('resolves this_week to the Monday-Sunday UTC week', () => {
    assert.deepEqual(resolveAnalyticsPeriod({ period: 'this_week' }, today), {
      period: 'this_week',
      startDate: '2026-05-11',
      endDate: '2026-05-17'
    });
  });

  it('resolves last_7_days as a rolling window including today', () => {
    assert.deepEqual(resolveAnalyticsPeriod({ period: 'last_7_days' }, today), {
      period: 'last_7_days',
      startDate: '2026-05-09',
      endDate: '2026-05-15'
    });
  });

  it('keeps explicit dates when startDate is before endDate', () => {
    assert.deepEqual(
      resolveAnalyticsPeriod({ startDate: '2026-05-01', endDate: '2026-05-14' }, today),
      { startDate: '2026-05-01', endDate: '2026-05-14' }
    );
  });

  it('rejects inverted explicit dates', () => {
    assert.throws(
      () => resolveAnalyticsPeriod({ startDate: '2026-05-14', endDate: '2026-05-01' }, today),
      /startDate must be before or equal to endDate/
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/modules/analytics/analytics-periods.test.ts`

Expected: FAIL with module not found for `analytics-periods.js`.

- [ ] **Step 4: Implement the period resolver**

Create `src/modules/analytics/analytics-periods.ts`:

```ts
export const analyticsPeriods = [
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'last_7_days',
  'last_30_days'
] as const;

export type AnalyticsPeriod = (typeof analyticsPeriods)[number];

export type AnalyticsPeriodInput = {
  period?: AnalyticsPeriod;
  startDate?: string;
  endDate?: string;
};

export type ResolvedAnalyticsPeriod = {
  period?: AnalyticsPeriod;
  startDate: string;
  endDate: string;
};

export function resolveAnalyticsPeriod(input: AnalyticsPeriodInput, now = new Date()): ResolvedAnalyticsPeriod {
  if (input.startDate || input.endDate) {
    if (!input.startDate || !input.endDate) {
      throw new Error('Both startDate and endDate are required for explicit date ranges');
    }

    if (input.startDate > input.endDate) {
      throw new Error('startDate must be before or equal to endDate');
    }

    return { startDate: input.startDate, endDate: input.endDate };
  }

  const today = startOfUtcDay(now);
  const period = input.period ?? 'this_week';

  if (period === 'today') {
    const value = toIsoDate(today);
    return { period, startDate: value, endDate: value };
  }

  if (period === 'yesterday') {
    const value = toIsoDate(addDays(today, -1));
    return { period, startDate: value, endDate: value };
  }

  if (period === 'this_week') {
    const startDate = startOfUtcWeek(today);
    return { period, startDate: toIsoDate(startDate), endDate: toIsoDate(addDays(startDate, 6)) };
  }

  if (period === 'last_week') {
    const startDate = addDays(startOfUtcWeek(today), -7);
    return { period, startDate: toIsoDate(startDate), endDate: toIsoDate(addDays(startDate, 6)) };
  }

  if (period === 'this_month') {
    const startDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const endDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
    return { period, startDate: toIsoDate(startDate), endDate: toIsoDate(endDate) };
  }

  if (period === 'last_month') {
    const startDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const endDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
    return { period, startDate: toIsoDate(startDate), endDate: toIsoDate(endDate) };
  }

  if (period === 'last_7_days') {
    return { period, startDate: toIsoDate(addDays(today, -6)), endDate: toIsoDate(today) };
  }

  return { period, startDate: toIsoDate(addDays(today, -29)), endDate: toIsoDate(today) };
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfUtcWeek(date: Date): Date {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
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

- [ ] **Step 5: Run test and typecheck**

Run: `npm test -- src/modules/analytics/analytics-periods.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json src/modules/analytics/analytics-periods.ts src/modules/analytics/analytics-periods.test.ts
git commit -m "test: add analytics period resolver"
```

---

### Task 2: Define Intent Catalog And Classifier Schemas

**Files:**
- Create: `src/modules/analytics/analytics-intents.ts`
- Create: `src/modules/analytics/analytics-intents.test.ts`

- [ ] **Step 1: Write the failing catalog test**

Create `src/modules/analytics/analytics-intents.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  analyticsIntentCatalog,
  analyticsIntentNames,
  classifiedAnalyticsIntentSchema
} from './analytics-intents.js';

describe('analytics intent catalog', () => {
  it('contains every supported intent with examples and parameter names', () => {
    assert.deepEqual(analyticsIntentNames, [
      'distance_summary',
      'run_count_summary',
      'duration_summary',
      'pace_summary',
      'weekly_summary',
      'longest_run',
      'effort_summary',
      'plan_adherence',
      'planned_vs_actual',
      'workout_type_breakdown',
      'workout_summary',
      'lap_summary'
    ]);

    for (const intent of analyticsIntentCatalog) {
      assert.ok(intent.description.length > 0);
      assert.ok(intent.examples.length > 0);
      assert.ok(Array.isArray(intent.parameters));
    }
  });

  it('rejects unknown intents', () => {
    assert.throws(
      () => classifiedAnalyticsIntentSchema.parse({ name: 'raw_sql', parameters: {}, confidence: 1 }),
      /Invalid enum value/
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/modules/analytics/analytics-intents.test.ts`

Expected: FAIL with module not found for `analytics-intents.js`.

- [ ] **Step 3: Implement intent catalog**

Create `src/modules/analytics/analytics-intents.ts`:

```ts
import { z } from 'zod';
import { analyticsPeriods } from './analytics-periods.js';

export const analyticsIntentNames = [
  'distance_summary',
  'run_count_summary',
  'duration_summary',
  'pace_summary',
  'weekly_summary',
  'longest_run',
  'effort_summary',
  'plan_adherence',
  'planned_vs_actual',
  'workout_type_breakdown',
  'workout_summary',
  'lap_summary'
] as const;

export type AnalyticsIntentName = (typeof analyticsIntentNames)[number];

export const workoutKinds = ['easy', 'workout', 'long', 'race', 'other'] as const;

export type WorkoutKind = (typeof workoutKinds)[number];

export type AnalyticsIntentCatalogEntry = {
  name: AnalyticsIntentName;
  description: string;
  parameters: string[];
  examples: string[];
};

export const analyticsIntentCatalog: AnalyticsIntentCatalogEntry[] = [
  {
    name: 'distance_summary',
    description: 'Distance and runs for a period.',
    parameters: ['period', 'startDate', 'endDate'],
    examples: ['сколько я пробежал за неделю', 'километраж за месяц']
  },
  {
    name: 'run_count_summary',
    description: 'Run count for a period.',
    parameters: ['period', 'startDate', 'endDate'],
    examples: ['сколько было пробежек за неделю']
  },
  {
    name: 'duration_summary',
    description: 'Total running time for a period.',
    parameters: ['period', 'startDate', 'endDate'],
    examples: ['сколько времени я бегал за месяц']
  },
  {
    name: 'pace_summary',
    description: 'Average pace for a period.',
    parameters: ['period', 'startDate', 'endDate'],
    examples: ['какой средний темп за неделю']
  },
  {
    name: 'weekly_summary',
    description: 'Weekly aggregate: count, distance, duration, longest run, pace, effort.',
    parameters: ['weekStart'],
    examples: ['сводка за неделю']
  },
  {
    name: 'longest_run',
    description: 'Longest run in a period.',
    parameters: ['period', 'startDate', 'endDate'],
    examples: ['самая длинная пробежка за месяц']
  },
  {
    name: 'effort_summary',
    description: 'Average effort and effort distribution.',
    parameters: ['period', 'startDate', 'endDate'],
    examples: ['как ощущались тренировки за неделю']
  },
  {
    name: 'plan_adherence',
    description: 'Current plan adherence.',
    parameters: ['period'],
    examples: ['как я выполняю план']
  },
  {
    name: 'planned_vs_actual',
    description: 'Planned workouts compared with completed runs.',
    parameters: ['period', 'startDate', 'endDate'],
    examples: ['сравни план и факт на этой неделе']
  },
  {
    name: 'workout_type_breakdown',
    description: 'Metrics grouped by workout kind.',
    parameters: ['period', 'workoutKind'],
    examples: ['разбивка тренировок по типам за месяц']
  },
  {
    name: 'workout_summary',
    description: 'Quality workout-kind runs for a period.',
    parameters: ['period', 'startDate', 'endDate'],
    examples: ['покажи интервальные за месяц']
  },
  {
    name: 'lap_summary',
    description: 'Workout laps grouped by run.',
    parameters: ['period', 'runId'],
    examples: ['покажи круги интервальных за месяц']
  }
];

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const analyticsIntentParametersSchema = z
  .object({
    period: z.enum(analyticsPeriods).optional(),
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.optional(),
    weekStart: isoDateSchema.optional(),
    workoutKind: z.enum(workoutKinds).optional(),
    runId: z.string().uuid().optional()
  })
  .strict();

export const classifiedAnalyticsIntentSchema = z
  .object({
    name: z.enum(analyticsIntentNames),
    parameters: analyticsIntentParametersSchema.default({}),
    confidence: z.number().min(0).max(1).default(1)
  })
  .strict();

export type ClassifiedAnalyticsIntent = z.infer<typeof classifiedAnalyticsIntentSchema>;

export const classifiedAnalyticsIntentsSchema = z.array(classifiedAnalyticsIntentSchema).min(1).max(4);
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- src/modules/analytics/analytics-intents.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/analytics/analytics-intents.ts src/modules/analytics/analytics-intents.test.ts
git commit -m "feat: define analytics intent catalog"
```

---

### Task 3: Add Rule-Based Classifier And Clarifications

**Files:**
- Create: `src/modules/analytics/analytics-rule-classifier.ts`
- Create: `src/modules/analytics/analytics-rule-classifier.test.ts`
- Create: `src/modules/analytics/analytics-clarification.ts`
- Create: `src/modules/analytics/analytics-clarification.test.ts`

- [ ] **Step 1: Write classifier tests**

Create `src/modules/analytics/analytics-rule-classifier.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyAnalyticsQuestionWithRules } from './analytics-rule-classifier.js';

describe('classifyAnalyticsQuestionWithRules', () => {
  it('classifies distance questions', () => {
    assert.deepEqual(classifyAnalyticsQuestionWithRules('сколько я пробежал за неделю')?.intents, [
      { name: 'distance_summary', parameters: { period: 'this_week' }, confidence: 0.95 }
    ]);
  });

  it('classifies pace questions for last 30 days', () => {
    assert.deepEqual(classifyAnalyticsQuestionWithRules('какой темп за последние 30 дней')?.intents, [
      { name: 'pace_summary', parameters: { period: 'last_30_days' }, confidence: 0.9 }
    ]);
  });

  it('classifies explicit multi-metric questions', () => {
    assert.deepEqual(classifyAnalyticsQuestionWithRules('километраж и темп за месяц')?.intents, [
      { name: 'distance_summary', parameters: { period: 'this_month' }, confidence: 0.9 },
      { name: 'pace_summary', parameters: { period: 'this_month' }, confidence: 0.9 }
    ]);
  });

  it('returns null for ambiguous training questions', () => {
    assert.equal(classifyAnalyticsQuestionWithRules('как у меня с тренировками'), null);
  });
});
```

- [ ] **Step 2: Implement classifier**

Create `src/modules/analytics/analytics-rule-classifier.ts`:

```ts
import type { AnalyticsPeriod } from './analytics-periods.js';
import type { ClassifiedAnalyticsIntent } from './analytics-intents.js';

export type RuleClassification = {
  source: 'rules';
  intents: ClassifiedAnalyticsIntent[];
};

export function classifyAnalyticsQuestionWithRules(question: string): RuleClassification | null {
  const text = normalize(question);
  const period = detectPeriod(text);
  const intents: ClassifiedAnalyticsIntent[] = [];

  if (hasAny(text, ['километраж', 'сколько пробежал', 'сколько я пробежал', 'дистанц'])) {
    intents.push({ name: 'distance_summary', parameters: { period }, confidence: 0.95 });
  }

  if (hasAny(text, ['темп', 'pace'])) {
    intents.push({ name: 'pace_summary', parameters: { period }, confidence: 0.9 });
  }

  if (hasAny(text, ['сколько пробежек', 'количество пробежек'])) {
    intents.push({ name: 'run_count_summary', parameters: { period }, confidence: 0.9 });
  }

  if (hasAny(text, ['сколько времени', 'длительность', 'общее время'])) {
    intents.push({ name: 'duration_summary', parameters: { period }, confidence: 0.9 });
  }

  if (hasAny(text, ['самая длинная', 'longest'])) {
    intents.push({ name: 'longest_run', parameters: { period }, confidence: 0.9 });
  }

  if (hasAny(text, ['усилие', 'effort', 'ощущал', 'ощущались'])) {
    intents.push({ name: 'effort_summary', parameters: { period }, confidence: 0.85 });
  }

  if (hasAny(text, ['выполняю план', 'выполнение плана', 'adherence'])) {
    intents.push({ name: 'plan_adherence', parameters: {}, confidence: 0.9 });
  }

  if (hasAny(text, ['план и факт', 'сравни план', 'план факт'])) {
    intents.push({ name: 'planned_vs_actual', parameters: { period }, confidence: 0.9 });
  }

  if (hasAny(text, ['по типам', 'типы тренировок', 'разбивка тренировок'])) {
    intents.push({ name: 'workout_type_breakdown', parameters: { period }, confidence: 0.9 });
  }

  if (hasAny(text, ['интервальные', 'качественные', 'workout'])) {
    intents.push({ name: 'workout_summary', parameters: { period }, confidence: 0.85 });
  }

  if (hasAny(text, ['круги', 'laps', 'лап'])) {
    intents.push({ name: 'lap_summary', parameters: { period }, confidence: 0.85 });
  }

  return intents.length > 0 ? { source: 'rules', intents: dedupeIntents(intents) } : null;
}

function normalize(question: string): string {
  return question.toLocaleLowerCase('ru').trim().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

function detectPeriod(text: string): AnalyticsPeriod {
  if (hasAny(text, ['сегодня'])) return 'today';
  if (hasAny(text, ['вчера'])) return 'yesterday';
  if (hasAny(text, ['прошлую неделю', 'за прошлую неделю'])) return 'last_week';
  if (hasAny(text, ['последние 7 дней', 'за 7 дней'])) return 'last_7_days';
  if (hasAny(text, ['последние 30 дней', 'за 30 дней'])) return 'last_30_days';
  if (hasAny(text, ['прошлый месяц', 'за прошлый месяц'])) return 'last_month';
  if (hasAny(text, ['месяц', 'за месяц'])) return 'this_month';
  return 'this_week';
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function dedupeIntents(intents: ClassifiedAnalyticsIntent[]): ClassifiedAnalyticsIntent[] {
  const seen = new Set<string>();
  return intents.filter((intent) => {
    if (seen.has(intent.name)) return false;
    seen.add(intent.name);
    return true;
  });
}
```

- [ ] **Step 3: Write clarification tests**

Create `src/modules/analytics/analytics-clarification.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAnalyticsClarificationOptions } from './analytics-clarification.js';

describe('buildAnalyticsClarificationOptions', () => {
  it('builds executable options for ambiguous training questions', () => {
    assert.deepEqual(buildAnalyticsClarificationOptions('как у меня с тренировками'), [
      {
        label: 'Километраж за эту неделю',
        intents: [{ name: 'distance_summary', parameters: { period: 'this_week' }, confidence: 1 }]
      },
      {
        label: 'Выполнение плана',
        intents: [{ name: 'plan_adherence', parameters: {}, confidence: 1 }]
      },
      {
        label: 'Разбивка по типам за эту неделю',
        intents: [{ name: 'workout_type_breakdown', parameters: { period: 'this_week' }, confidence: 1 }]
      }
    ]);
  });
});
```

- [ ] **Step 4: Implement clarification builder**

Create `src/modules/analytics/analytics-clarification.ts`:

```ts
import type { ClassifiedAnalyticsIntent } from './analytics-intents.js';

export type AnalyticsClarificationOption = {
  label: string;
  intents: ClassifiedAnalyticsIntent[];
};

export function buildAnalyticsClarificationOptions(question: string): AnalyticsClarificationOption[] {
  const text = question.toLocaleLowerCase('ru');

  if (text.includes('интервал') || text.includes('круг') || text.includes('lap')) {
    return [
      { label: 'Интервальные за эту неделю', intents: [{ name: 'workout_summary', parameters: { period: 'this_week' }, confidence: 1 }] },
      { label: 'Интервальные за последние 30 дней', intents: [{ name: 'workout_summary', parameters: { period: 'last_30_days' }, confidence: 1 }] },
      { label: 'Круги интервальных за последние 30 дней', intents: [{ name: 'lap_summary', parameters: { period: 'last_30_days' }, confidence: 1 }] }
    ];
  }

  return [
    { label: 'Километраж за эту неделю', intents: [{ name: 'distance_summary', parameters: { period: 'this_week' }, confidence: 1 }] },
    { label: 'Выполнение плана', intents: [{ name: 'plan_adherence', parameters: {}, confidence: 1 }] },
    { label: 'Разбивка по типам за эту неделю', intents: [{ name: 'workout_type_breakdown', parameters: { period: 'this_week' }, confidence: 1 }] }
  ];
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- src/modules/analytics/analytics-rule-classifier.test.ts src/modules/analytics/analytics-clarification.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/analytics/analytics-rule-classifier.ts src/modules/analytics/analytics-rule-classifier.test.ts src/modules/analytics/analytics-clarification.ts src/modules/analytics/analytics-clarification.test.ts
git commit -m "feat: classify common analytics questions"
```

---

### Task 4: Add LLM Classifier Adapter

**Files:**
- Modify: `src/shared/config/env.ts`
- Create: `src/modules/analytics/analytics-llm-classifier.ts`
- Create: `src/modules/analytics/analytics-llm-classifier.test.ts`

- [ ] **Step 1: Add optional LLM env vars**

Modify `src/shared/config/env.ts`:

```ts
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url().default('postgres://runlogbook:runlogbook@localhost:5432/runlogbook'),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  APP_SECRET: z.string().min(32).default('development-secret-change-before-prod'),
  STRAVA_CLIENT_ID: z.string().optional(),
  STRAVA_CLIENT_SECRET: z.string().optional(),
  STRAVA_WEBHOOK_VERIFY_TOKEN: z.string().default('development-strava-webhook-token'),
  ANALYTICS_LLM_ENDPOINT: z.string().url().optional(),
  ANALYTICS_LLM_API_KEY: z.string().optional(),
  ANALYTICS_LLM_MODEL: z.string().default('gpt-4o-mini')
});
```

- [ ] **Step 2: Write LLM adapter tests**

Create `src/modules/analytics/analytics-llm-classifier.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LlmAnalyticsClassifier } from './analytics-llm-classifier.js';

describe('LlmAnalyticsClassifier', () => {
  it('parses valid allowlisted JSON', async () => {
    const classifier = new LlmAnalyticsClassifier({
      endpoint: 'https://llm.example.test/v1/chat/completions',
      apiKey: 'test-key',
      model: 'test-model',
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    intents: [{ name: 'distance_summary', parameters: { period: 'this_week' }, confidence: 0.82 }]
                  })
                }
              }
            ]
          })
        )
    });

    assert.deepEqual(await classifier.classify('сколько я пробежал за неделю'), {
      source: 'llm',
      intents: [{ name: 'distance_summary', parameters: { period: 'this_week' }, confidence: 0.82 }]
    });
  });

  it('rejects unknown intents', async () => {
    const classifier = new LlmAnalyticsClassifier({
      endpoint: 'https://llm.example.test/v1/chat/completions',
      apiKey: 'test-key',
      model: 'test-model',
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ intents: [{ name: 'raw_sql', parameters: {}, confidence: 1 }] }) } }]
          })
        )
    });

    await assert.rejects(() => classifier.classify('drop table runs'), /Invalid enum value/);
  });
});
```

- [ ] **Step 3: Implement LLM adapter**

Create `src/modules/analytics/analytics-llm-classifier.ts`:

```ts
import { z } from 'zod';
import { analyticsIntentCatalog, classifiedAnalyticsIntentsSchema } from './analytics-intents.js';
import { analyticsPeriods } from './analytics-periods.js';

type FetchLike = typeof fetch;

export type LlmClassification = {
  source: 'llm';
  intents: z.infer<typeof classifiedAnalyticsIntentsSchema>;
};

export class LlmAnalyticsClassifier {
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly config: {
      endpoint?: string;
      apiKey?: string;
      model: string;
      fetch?: FetchLike;
    }
  ) {
    this.fetchImpl = config.fetch ?? fetch;
  }

  isConfigured(): boolean {
    return Boolean(this.config.endpoint && this.config.apiKey);
  }

  async classify(question: string): Promise<LlmClassification> {
    if (!this.config.endpoint || !this.config.apiKey) {
      throw new Error('Analytics LLM is not configured');
    }

    const response = await this.fetchImpl(this.config.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: [
              'You classify Russian running analytics questions.',
              'Return strict JSON only with shape {"intents":[{"name":"...","parameters":{},"confidence":0.0}]} .',
              'Never return SQL. Never invent intent names or parameter names.',
              `Allowed periods: ${analyticsPeriods.join(', ')}.`,
              `Allowed intents: ${JSON.stringify(analyticsIntentCatalog)}.`
            ].join('\n')
          },
          { role: 'user', content: question }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Analytics LLM request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Analytics LLM returned no content');
    }

    const parsed = z.object({ intents: classifiedAnalyticsIntentsSchema }).strict().parse(JSON.parse(content));

    return { source: 'llm', intents: parsed.intents };
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- src/modules/analytics/analytics-llm-classifier.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/config/env.ts src/modules/analytics/analytics-llm-classifier.ts src/modules/analytics/analytics-llm-classifier.test.ts
git commit -m "feat: add constrained analytics llm classifier"
```

---

### Task 5: Expand Analytics Repository And Executor

**Files:**
- Modify: `src/modules/analytics/analytics.repository.ts`
- Create: `src/modules/analytics/analytics-query-executor.ts`
- Create: `src/modules/analytics/analytics-query-executor.test.ts`

- [ ] **Step 1: Write executor unit test with fake repository**

Create `src/modules/analytics/analytics-query-executor.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AnalyticsQueryExecutor } from './analytics-query-executor.js';

describe('AnalyticsQueryExecutor', () => {
  it('executes distance and pace intents against repository methods', async () => {
    const calls: string[] = [];
    const executor = new AnalyticsQueryExecutor({
      getDistanceSummary: async () => {
        calls.push('distance');
        return { startDate: '2026-05-11', endDate: '2026-05-17', runCount: 1, totalDistanceMeters: 10000, totalDistanceKm: 10, runs: [] };
      },
      getPaceSummary: async () => {
        calls.push('pace');
        return { startDate: '2026-05-11', endDate: '2026-05-17', averagePaceSecondsPerKm: 300, runs: [] };
      }
    });

    const results = await executor.execute({
      userId: 'user-1',
      intents: [
        { name: 'distance_summary', parameters: { period: 'this_week', startDate: '2026-05-11', endDate: '2026-05-17' }, confidence: 1 },
        { name: 'pace_summary', parameters: { period: 'this_week', startDate: '2026-05-11', endDate: '2026-05-17' }, confidence: 1 }
      ]
    });

    assert.deepEqual(calls, ['distance', 'pace']);
    assert.equal(results[0].intent, 'distance_summary');
    assert.equal(results[1].intent, 'pace_summary');
  });
});
```

- [ ] **Step 2: Add repository return types and methods**

Modify `src/modules/analytics/analytics.repository.ts` by adding these exported types after `DistanceSummary`:

```ts
export type RunCountSummary = { startDate: string; endDate: string; runCount: number };
export type DurationSummary = { startDate: string; endDate: string; totalDurationSeconds: number; runs: DistanceSummaryRun[] };
export type PaceSummary = { startDate: string; endDate: string; averagePaceSecondsPerKm: number | null; runs: Array<DistanceSummaryRun & { paceSecondsPerKm: number | null }> };
export type LongestRunSummary = { startDate: string; endDate: string; runs: DistanceSummaryRun[] };
export type EffortSummary = { startDate: string; endDate: string; averagePerceivedEffort: number | null; distribution: Array<{ effort: number; count: number }> };
export type PlannedVsActualSummary = { startDate: string; endDate: string; items: Array<{ plannedWorkoutId: string; scheduledOn: string; title: string; status: string; completedRunId: string | null; matchStatus: 'linked' | 'same_day' | 'unmatched'; runId: string | null; runTitle: string | null }> };
export type WorkoutTypeBreakdown = { startDate: string; endDate: string; groups: Array<{ workoutKind: string | null; runCount: number; totalDistanceMeters: number; totalDurationSeconds: number }> };
export type WorkoutSummary = { startDate: string; endDate: string; runs: Array<DistanceSummaryRun & { workoutStructure: string | null; perceivedEffort: number | null }> };
export type LapSummary = { startDate: string; endDate: string; runs: Array<{ runId: string; occurredOn: string; title: string | null; laps: Array<{ lapNumber: number; lapKind: string; distanceMeters: number; correctedDistanceMeters: number | null; movingTimeSeconds: number; elapsedTimeSeconds: number; averageHeartrate: number | null; maxHeartrate: number | null; heartRateRecoveryBpm: number | null; needsReview: boolean }> }> };
```

Add methods to `AnalyticsRepository` using the existing `this.pool.query` pattern. Keep SQL scoped by `user_id` in every method. Use `roundKm` for km values where returning `DistanceSummaryRun`.

Required method signatures:

```ts
async getRunCountSummary(input: { userId: string; startDate: string; endDate: string }): Promise<RunCountSummary>
async getDurationSummary(input: { userId: string; startDate: string; endDate: string }): Promise<DurationSummary>
async getPaceSummary(input: { userId: string; startDate: string; endDate: string }): Promise<PaceSummary>
async getLongestRun(input: { userId: string; startDate: string; endDate: string }): Promise<LongestRunSummary>
async getEffortSummary(input: { userId: string; startDate: string; endDate: string }): Promise<EffortSummary>
async getPlannedVsActual(input: { userId: string; startDate: string; endDate: string }): Promise<PlannedVsActualSummary>
async getWorkoutTypeBreakdown(input: { userId: string; startDate: string; endDate: string }): Promise<WorkoutTypeBreakdown>
async getWorkoutSummary(input: { userId: string; startDate: string; endDate: string }): Promise<WorkoutSummary>
async getLapSummary(input: { userId: string; startDate: string; endDate: string; runId?: string }): Promise<LapSummary>
```

For `getLapSummary`, join `runs` to `draft_runs` through `draft_runs.clarified_run_id = runs.id`, then join `workout_laps` through `workout_laps.draft_run_id = draft_runs.id`. Filter all three by the authenticated user where applicable.

- [ ] **Step 3: Implement executor**

Create `src/modules/analytics/analytics-query-executor.ts`:

```ts
import type { ClassifiedAnalyticsIntent } from './analytics-intents.js';
import type { AnalyticsRepository } from './analytics.repository.js';

export type AnalyticsQueryResult = {
  intent: string;
  data: unknown;
};

type AnalyticsRepositoryLike = Partial<AnalyticsRepository>;

export class AnalyticsQueryExecutor {
  constructor(private readonly repository: AnalyticsRepositoryLike) {}

  async execute(input: { userId: string; intents: ClassifiedAnalyticsIntent[] }): Promise<AnalyticsQueryResult[]> {
    const results: AnalyticsQueryResult[] = [];

    for (const intent of input.intents) {
      const startDate = intent.parameters.startDate;
      const endDate = intent.parameters.endDate;

      if (intent.name === 'weekly_summary') {
        results.push({ intent: intent.name, data: await this.require('getWeeklySummary')({ userId: input.userId, weekStart: intent.parameters.weekStart!, weekEnd: endDate! }) });
        continue;
      }

      if (intent.name === 'plan_adherence') {
        results.push({ intent: intent.name, data: await this.require('getCurrentPlanAdherence')(input.userId, new Date().toISOString().slice(0, 10)) });
        continue;
      }

      if (!startDate || !endDate) {
        throw new Error(`Intent ${intent.name} requires startDate and endDate`);
      }

      const periodInput = { userId: input.userId, startDate, endDate };

      if (intent.name === 'distance_summary') results.push({ intent: intent.name, data: await this.require('getDistanceSummary')(periodInput) });
      else if (intent.name === 'run_count_summary') results.push({ intent: intent.name, data: await this.require('getRunCountSummary')(periodInput) });
      else if (intent.name === 'duration_summary') results.push({ intent: intent.name, data: await this.require('getDurationSummary')(periodInput) });
      else if (intent.name === 'pace_summary') results.push({ intent: intent.name, data: await this.require('getPaceSummary')(periodInput) });
      else if (intent.name === 'longest_run') results.push({ intent: intent.name, data: await this.require('getLongestRun')(periodInput) });
      else if (intent.name === 'effort_summary') results.push({ intent: intent.name, data: await this.require('getEffortSummary')(periodInput) });
      else if (intent.name === 'planned_vs_actual') results.push({ intent: intent.name, data: await this.require('getPlannedVsActual')(periodInput) });
      else if (intent.name === 'workout_type_breakdown') results.push({ intent: intent.name, data: await this.require('getWorkoutTypeBreakdown')(periodInput) });
      else if (intent.name === 'workout_summary') results.push({ intent: intent.name, data: await this.require('getWorkoutSummary')(periodInput) });
      else if (intent.name === 'lap_summary') results.push({ intent: intent.name, data: await this.require('getLapSummary')({ ...periodInput, runId: intent.parameters.runId }) });
      else throw new Error(`Unsupported analytics intent: ${intent.name}`);
    }

    return results;
  }

  private require(name: keyof AnalyticsRepository): (...args: any[]) => Promise<any> {
    const method = this.repository[name];

    if (typeof method !== 'function') {
      throw new Error(`Analytics repository method ${String(name)} is not available`);
    }

    return method.bind(this.repository) as (...args: any[]) => Promise<any>;
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- src/modules/analytics/analytics-query-executor.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/analytics/analytics.repository.ts src/modules/analytics/analytics-query-executor.ts src/modules/analytics/analytics-query-executor.test.ts
git commit -m "feat: execute allowlisted analytics intents"
```

---

### Task 6: Add Query Service And API Endpoint

**Files:**
- Modify: `src/modules/analytics/analytics.schemas.ts`
- Create: `src/modules/analytics/analytics-query.service.ts`
- Create: `src/modules/analytics/analytics-query.service.test.ts`
- Modify: `src/modules/analytics/analytics.routes.ts`

- [ ] **Step 1: Add request schema**

Modify `src/modules/analytics/analytics.schemas.ts`:

```ts
import { classifiedAnalyticsIntentsSchema } from './analytics-intents.js';

export const analyticsQueryRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    selectedOption: z
      .object({
        intents: classifiedAnalyticsIntentsSchema
      })
      .strict()
      .optional()
  })
  .strict();
```

Keep the existing `weeklySummaryQuerySchema` and `distanceSummaryQuerySchema` exports.

- [ ] **Step 2: Write service tests**

Create `src/modules/analytics/analytics-query.service.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AnalyticsQueryService } from './analytics-query.service.js';

describe('AnalyticsQueryService', () => {
  it('answers confident rule classifications without LLM', async () => {
    const service = new AnalyticsQueryService({
      executor: { execute: async () => [{ intent: 'distance_summary', data: { totalDistanceKm: 42 } }] },
      llmClassifier: { isConfigured: () => true, classify: async () => { throw new Error('LLM should not be called'); } },
      now: () => new Date('2026-05-15T12:00:00.000Z')
    });

    assert.deepEqual(await service.query({ userId: 'user-1', question: 'сколько я пробежал за неделю' }), {
      status: 'answered',
      question: 'сколько я пробежал за неделю',
      resolved: {
        source: 'rules',
        intents: [{ name: 'distance_summary', parameters: { period: 'this_week', startDate: '2026-05-11', endDate: '2026-05-17' }, confidence: 0.95 }]
      },
      results: [{ intent: 'distance_summary', data: { totalDistanceKm: 42 } }]
    });
  });

  it('returns clarification when neither rules nor LLM produce a classification', async () => {
    const service = new AnalyticsQueryService({
      executor: { execute: async () => [] },
      llmClassifier: { isConfigured: () => false, classify: async () => { throw new Error('not configured'); } },
      now: () => new Date('2026-05-15T12:00:00.000Z')
    });

    const response = await service.query({ userId: 'user-1', question: 'как у меня с тренировками' });

    assert.equal(response.status, 'needs_clarification');
    assert.equal(response.options.length, 3);
  });
});
```

- [ ] **Step 3: Implement service**

Create `src/modules/analytics/analytics-query.service.ts`:

```ts
import type { ClassifiedAnalyticsIntent } from './analytics-intents.js';
import { buildAnalyticsClarificationOptions } from './analytics-clarification.js';
import type { LlmAnalyticsClassifier } from './analytics-llm-classifier.js';
import { resolveAnalyticsPeriod } from './analytics-periods.js';
import type { AnalyticsQueryExecutor, AnalyticsQueryResult } from './analytics-query-executor.js';
import { classifyAnalyticsQuestionWithRules } from './analytics-rule-classifier.js';

export type AnalyticsQueryResponse =
  | {
      status: 'answered';
      question: string;
      resolved: { source: 'rules' | 'llm' | 'user_selection'; intents: ClassifiedAnalyticsIntent[] };
      results: AnalyticsQueryResult[];
    }
  | {
      status: 'needs_clarification';
      question: string;
      options: ReturnType<typeof buildAnalyticsClarificationOptions>;
    };

export class AnalyticsQueryService {
  constructor(
    private readonly dependencies: {
      executor: Pick<AnalyticsQueryExecutor, 'execute'>;
      llmClassifier: Pick<LlmAnalyticsClassifier, 'isConfigured' | 'classify'>;
      now?: () => Date;
    }
  ) {}

  async query(input: {
    userId: string;
    question: string;
    selectedOption?: { intents: ClassifiedAnalyticsIntent[] };
  }): Promise<AnalyticsQueryResponse> {
    if (input.selectedOption) {
      return this.answer(input.userId, input.question, 'user_selection', input.selectedOption.intents);
    }

    const ruleClassification = classifyAnalyticsQuestionWithRules(input.question);

    if (ruleClassification) {
      return this.answer(input.userId, input.question, 'rules', ruleClassification.intents);
    }

    if (this.dependencies.llmClassifier.isConfigured()) {
      try {
        const llmClassification = await this.dependencies.llmClassifier.classify(input.question);

        if (llmClassification.intents.every((intent) => intent.confidence >= 0.7)) {
          return this.answer(input.userId, input.question, 'llm', llmClassification.intents);
        }
      } catch {
        return { status: 'needs_clarification', question: input.question, options: buildAnalyticsClarificationOptions(input.question) };
      }
    }

    return { status: 'needs_clarification', question: input.question, options: buildAnalyticsClarificationOptions(input.question) };
  }

  private async answer(
    userId: string,
    question: string,
    source: 'rules' | 'llm' | 'user_selection',
    intents: ClassifiedAnalyticsIntent[]
  ): Promise<AnalyticsQueryResponse> {
    const now = this.dependencies.now?.() ?? new Date();
    const resolvedIntents = intents.map((intent) => ({ ...intent, parameters: resolveIntentParameters(intent) }));
    const results = await this.dependencies.executor.execute({ userId, intents: resolvedIntents });

    return { status: 'answered', question, resolved: { source, intents: resolvedIntents }, results };

    function resolveIntentParameters(intent: ClassifiedAnalyticsIntent): ClassifiedAnalyticsIntent['parameters'] {
      if (intent.name === 'plan_adherence') {
        return intent.parameters;
      }

      if (intent.name === 'weekly_summary') {
        const resolved = resolveAnalyticsPeriod({ period: 'this_week', ...intent.parameters }, now);
        return { ...intent.parameters, weekStart: intent.parameters.weekStart ?? resolved.startDate, startDate: resolved.startDate, endDate: resolved.endDate };
      }

      const resolved = resolveAnalyticsPeriod(intent.parameters, now);
      return { ...intent.parameters, startDate: resolved.startDate, endDate: resolved.endDate };
    }
  }
}
```

- [ ] **Step 4: Wire route**

Modify `src/modules/analytics/analytics.routes.ts` imports:

```ts
import { env } from '../../shared/config/env.js';
import { AnalyticsQueryExecutor } from './analytics-query-executor.js';
import { AnalyticsQueryService } from './analytics-query.service.js';
import { LlmAnalyticsClassifier } from './analytics-llm-classifier.js';
import { analyticsQueryRequestSchema, distanceSummaryQuerySchema, weeklySummaryQuerySchema } from './analytics.schemas.js';
```

Inside `registerAnalyticsRoutes`, after `const analytics = new AnalyticsRepository(...)`, add:

```ts
const analyticsQueryService = new AnalyticsQueryService({
  executor: new AnalyticsQueryExecutor(analytics),
  llmClassifier: new LlmAnalyticsClassifier({
    endpoint: env.ANALYTICS_LLM_ENDPOINT,
    apiKey: env.ANALYTICS_LLM_API_KEY,
    model: env.ANALYTICS_LLM_MODEL
  })
});
```

Add route before existing `GET /analytics/weekly-summary`:

```ts
app.post('/analytics/query', async (request) => {
  const body = analyticsQueryRequestSchema.parse(request.body);

  return analyticsQueryService.query({
    userId: request.user!.id,
    question: body.question,
    selectedOption: body.selectedOption
  });
});
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- src/modules/analytics/analytics-query.service.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/analytics/analytics.schemas.ts src/modules/analytics/analytics-query.service.ts src/modules/analytics/analytics-query.service.test.ts src/modules/analytics/analytics.routes.ts
git commit -m "feat: add analytics query endpoint"
```

---

### Task 7: Update Web Client For Query Responses

**Files:**
- Modify: `web/src/api.ts`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Add API types and function**

Modify `web/src/api.ts` by adding:

```ts
export type AnalyticsIntentPayload = {
  name: string;
  parameters: Record<string, unknown>;
  confidence?: number;
};

export type AnalyticsQueryResponse =
  | {
      status: 'answered';
      question: string;
      resolved: { source: 'rules' | 'llm' | 'user_selection'; intents: AnalyticsIntentPayload[] };
      results: Array<{ intent: string; data: unknown }>;
    }
  | {
      status: 'needs_clarification';
      question: string;
      options: Array<{ label: string; intents: AnalyticsIntentPayload[] }>;
    };

export async function askAnalyticsQuestion(
  token: string,
  input: { question: string; selectedOption?: { intents: AnalyticsIntentPayload[] } }
): Promise<AnalyticsQueryResponse> {
  return request('/analytics/query', { method: 'POST', token, body: input });
}
```

- [ ] **Step 2: Replace submit path in `App.tsx`**

Modify imports to use `askAnalyticsQuestion` and `AnalyticsQueryResponse` instead of only `getDistanceSummary` for the analytics panel.

Replace analytics state:

```ts
const [analyticsResponse, setAnalyticsResponse] = useState<AnalyticsQueryResponse | null>(null);
```

Replace `submitAnalyticsQuery` body with:

```ts
async function submitAnalyticsQuery(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();

  if (!token) {
    return;
  }

  setIsAnalyticsLoading(true);
  setError(null);
  try {
    setAnalyticsResponse(await askAnalyticsQuestion(token, { question: analyticsQuery }));
  } catch (caught) {
    setError(readError(caught));
  } finally {
    setIsAnalyticsLoading(false);
  }
}
```

Add option handler:

```ts
async function chooseAnalyticsOption(option: { intents: AnalyticsIntentPayload[] }) {
  if (!token || !analyticsResponse || analyticsResponse.status !== 'needs_clarification') {
    return;
  }

  setIsAnalyticsLoading(true);
  setError(null);
  try {
    setAnalyticsResponse(
      await askAnalyticsQuestion(token, {
        question: analyticsResponse.question,
        selectedOption: option
      })
    );
  } catch (caught) {
    setError(readError(caught));
  } finally {
    setIsAnalyticsLoading(false);
  }
}
```

Pass these props:

```tsx
<AnalyticsQueryPanel
  query={analyticsQuery}
  response={analyticsResponse}
  isLoading={isAnalyticsLoading}
  onQueryChange={setAnalyticsQuery}
  onSubmit={submitAnalyticsQuery}
  onChooseOption={chooseAnalyticsOption}
/>
```

- [ ] **Step 3: Render generic results and clarifications**

Update `AnalyticsQueryPanel` props:

```ts
function AnalyticsQueryPanel(props: {
  query: string;
  response: AnalyticsQueryResponse | null;
  isLoading: boolean;
  onQueryChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onChooseOption: (option: { intents: AnalyticsIntentPayload[] }) => void;
})
```

In the render body, replace `props.summary` rendering with:

```tsx
{props.response?.status === 'needs_clarification' ? (
  <div className="analytics-result">
    <p className="muted">Уточни, что именно показать:</p>
    <div className="option-grid">
      {props.response.options.map((option) => (
        <button key={option.label} className="secondary-button" onClick={() => props.onChooseOption(option)}>
          {option.label}
        </button>
      ))}
    </div>
  </div>
) : null}

{props.response?.status === 'answered' ? (
  <div className="analytics-result">
    {props.response.results.map((result) => (
      <div className="answer-card" key={result.intent}>
        <span>{formatIntentLabel(result.intent)}</span>
        <pre>{JSON.stringify(result.data, null, 2)}</pre>
      </div>
    ))}
  </div>
) : null}
```

Add a helper near existing formatting helpers:

```ts
function formatIntentLabel(intent: string): string {
  const labels: Record<string, string> = {
    distance_summary: 'Километраж',
    run_count_summary: 'Количество пробежек',
    duration_summary: 'Время бега',
    pace_summary: 'Темп',
    weekly_summary: 'Сводка недели',
    longest_run: 'Самая длинная пробежка',
    effort_summary: 'Усилие',
    plan_adherence: 'Выполнение плана',
    planned_vs_actual: 'План и факт',
    workout_type_breakdown: 'Типы тренировок',
    workout_summary: 'Качественные тренировки',
    lap_summary: 'Круги'
  };

  return labels[intent] ?? intent;
}
```

Keep the old `getDistanceSummary` function in `web/src/api.ts` until no other code references it. Remove `parseAnalyticsPeriod` and `formatAnalyticsAnswer` only if TypeScript reports they are unused.

- [ ] **Step 4: Build web and typecheck**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run web:build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/api.ts web/src/App.tsx
git commit -m "feat: route analytics questions through backend"
```

---

### Task 8: Final Verification And Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/product-behavior.md`

- [ ] **Step 1: Update endpoint docs**

In `README.md`, add this line to Available endpoints after existing analytics endpoints:

```md
- `POST /analytics/query`
```

- [ ] **Step 2: Update product behavior docs**

In `docs/product-behavior.md`, append this to the “Weekly Review” section:

```md

Natural-language analytics questions are routed through a hybrid intent classifier. The backend first applies deterministic rules for common Russian questions, then falls back to an allowlisted LLM classifier. The LLM never generates SQL; it only selects known analytics intents and parameters. If the question is ambiguous, the product returns 2-3 clarification options.
```

- [ ] **Step 3: Run full verification**

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/product-behavior.md
git commit -m "docs: document analytics query router"
```

---

## Self-Review Notes

- Spec coverage: the plan covers the hybrid router, intent catalog, API contract, rule classifier, LLM classifier, period resolution, clarification behavior, executor, repository expansion, UI flow, and testing.
- Safety coverage: LLM is constrained to allowlisted intents, unknown intents are rejected by Zod, SQL is only inside repository methods, and `lap_summary` is scoped by authenticated `userId`.
- Testing coverage: the plan adds a test harness and unit tests for periods, catalog validation, rules, clarification options, LLM validation, executor dispatch, and query service behavior. Repository SQL should be checked during Task 5 implementation and through full verification.
- Plan quality: tasks list concrete files, commands, expected outcomes, and code snippets for the new boundaries.
