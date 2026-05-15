# Runner Intelligence Context Builder Design

## Context

Runlogbook needs analytics for two related jobs:

- help the runner inspect facts from past training;
- help an LLM give useful running advice from the runner's training history, plan, notes, and draft workouts.

The earlier analytics query router design focused on mapping natural-language questions to fixed analytics intents. That remains useful for factual lookups, but it is too narrow as the center of the product. The core abstraction should be a safe context-building layer that prepares database facts for an LLM without letting the LLM access SQL directly.

## Decision

Build a hybrid Runner Intelligence architecture around a `RunnerContextBuilder`.

The backend will first classify the user's question, inspect available runner data, and build a compact context pack from allowlisted database queries. The LLM receives only prepared context sections and may request at most one additional allowlisted context section for complex questions. If the data is incomplete, the response must state that limitation and either answer cautiously or ask a follow-up question.

Existing `/analytics/*` endpoints remain available for direct data views. The new Runner Intelligence endpoint becomes the LLM-facing layer.

## Goals

- Support both coach-style advice and direct data lookup in one architecture.
- Keep database access safe: no LLM-generated SQL and no raw database access from the model.
- Make context sections independently testable against real PostgreSQL fixtures.
- Make low-data situations explicit instead of letting the LLM overstate confidence.
- Preserve the existing analytics work that already feels useful.

## Non-Goals

- Do not build a fully autonomous agent that can call unlimited tools.
- Do not replace existing analytics endpoints immediately.
- Do not generate training plans automatically in this iteration.
- Do not expose private raw Strava payloads to the LLM unless a section explicitly needs a sanitized subset.

## API

Add:

```text
POST /runner-intelligence/query
```

Request:

```json
{
  "question": "как у меня дела с тренировками?"
}
```

Response:

```json
{
  "mode": "coach_advice",
  "answer": "За последние 4 недели у тебя видно стабильный объем, но данных о самочувствии мало...",
  "confidence": "medium",
  "dataCoverage": {
    "runCount": 12,
    "weeksCovered": 4,
    "hasTrainingPlan": true,
    "hasSubjectiveNotes": false,
    "hasWorkoutLaps": true
  },
  "usedContextSections": [
    "recentTrainingSummary",
    "currentPlanSnapshot",
    "recentKeyWorkouts"
  ],
  "facts": [
    {
      "label": "Последние 4 недели",
      "value": "42 км, 45 км, 38 км, 47 км"
    }
  ],
  "followUpQuestions": [
    "Как ты себя чувствовал после последней интервальной?"
  ]
}
```

Response fields:

- `mode`: `data_lookup`, `coach_advice`, `plan_review`, `workout_review`, `onboarding_gap`, or `ambiguous`.
- `answer`: user-facing text generated from prepared context.
- `confidence`: `low`, `medium`, or `high`, based on data coverage and question type.
- `dataCoverage`: summary of available data used to qualify the answer.
- `usedContextSections`: context section names actually sent to the LLM.
- `facts`: optional structured facts for UI tables, lists, or cards.
- `followUpQuestions`: optional questions when the app needs more user context.

## Components

### RunnerContextRepository

Owns allowlisted SQL queries for context sections. It is the only component in this flow that talks directly to PostgreSQL.

Initial queries:

- data availability for the authenticated runner;
- weekly training rollups;
- recent runs;
- current plan snapshot;
- open draft runs;
- workout details for a single run.

The existing `AnalyticsRepository` can either be reused directly or have shared SQL extracted into this repository when overlap becomes meaningful.

### QuestionClassifier

Classifies the user's question into one primary mode:

- `data_lookup`: factual requests such as distance, count, pace, history, or lists.
- `coach_advice`: broad training advice such as "как у меня дела?".
- `plan_review`: questions about plan adherence or what to do next.
- `workout_review`: questions about a specific workout or recent quality session.
- `onboarding_gap`: questions that cannot be answered because the app lacks basic context.
- `ambiguous`: unclear questions requiring clarification.

The classifier can start with deterministic rules. LLM classification can be added later, but the output must remain an allowlisted enum.

### RunnerContextBuilder

Builds the base context pack for the question.

The base pack always includes data availability. It then includes sections relevant to the classified mode and the actual data present in the database.

### ContextToolRegistry

Defines additional allowlisted context tools the LLM may request after seeing the base pack.

MVP tools:

- `getWorkoutDetails(runId)`

Future tools:

- `getRecentLaps(period)`
- `getPlanAdherence(period)`
- `getLongRangeTrend(metric, period)`
- `getSimilarRuns(runId or workoutKind)`

The service must enforce a maximum of one additional tool call per user query in the MVP.

### RunnerIntelligenceService

Coordinates the flow:

1. Authenticate user through the route layer.
2. Classify the question.
3. Build the base context pack.
4. Call the LLM with the question, mode, context, and allowed tool metadata.
5. If the model requests one allowed tool, execute it and call the LLM one final time.
6. Validate and return the structured response.

## Context Sections

### dataAvailability

Summarizes what the app knows:

- run count;
- first and latest run dates;
- number of weeks covered;
- whether a current training plan exists;
- whether planned workouts exist;
- whether workout laps exist;
- whether open draft runs exist;
- whether subjective notes or effort values exist.

### recentTrainingSummary

Weekly aggregates for the last 4-8 weeks:

- distance;
- duration;
- run count;
- longest run;
- average effort when available.

### recentRuns

Last 10-20 runs:

- date;
- title;
- distance;
- duration;
- perceived effort;
- workout kind;
- short notes preview.

### recentKeyWorkouts

Recent workouts that are likely to matter for coaching context:

- interval, tempo, long, race, and other non-easy runs;
- date, title, distance, duration, workout kind, effort, and notes preview;
- whether workout laps exist for deeper review.

This section gives the LLM a compact view of quality sessions without sending every lap by default.

### currentPlanSnapshot

Current plan context when available:

- plan title and dates;
- upcoming planned workouts;
- completed, changed, skipped, and planned counts.

### openDrafts

Unprocessed Strava imports:

- draft id;
- activity id;
- title;
- occurred at;
- distance;
- moving time;
- whether workout laps need review.

This prevents the coach from ignoring a workout that exists in Strava import flow but has not yet been clarified by the user.

### questionRelevantFacts

Focused facts for the current question, such as:

- distance summary for a requested period;
- interval workouts for a requested period;
- plan adherence snapshot;
- recent workout list.

## Data Flow

1. User asks a question.
2. `POST /runner-intelligence/query` validates auth and input.
3. `QuestionClassifier` assigns a mode.
4. `RunnerContextBuilder` checks data availability.
5. Builder selects and fetches base context sections.
6. LLM receives the question, mode, base context, and allowed tool list.
7. LLM either answers immediately or requests one allowed context tool.
8. If a tool is requested, `RunnerIntelligenceService` validates the request, fetches the section, and calls the LLM once more.
9. The service validates the response shape.
10. The route returns answer, confidence, coverage, used sections, facts, and follow-up questions.

## Low-Data Behavior

The response must not overstate confidence when data is incomplete.

Rules:

- If there are no runs, return `onboarding_gap` and ask for goal/current level or suggest connecting Strava.
- If there are only a few runs, answer with `low` confidence and explain that conclusions are preliminary.
- If there is no plan and the question asks what to do next, say that plan context is missing and ask for goal or plan details.
- If subjective notes are missing, avoid strong claims about fatigue or wellbeing.
- If the question is factual, answer with facts and avoid unnecessary coaching.

## Testing Strategy

### Context Repository Tests

Use a real PostgreSQL test database with deterministic fixtures. These tests verify SQL and calculations for:

- data availability;
- weekly rollups;
- recent runs;
- current plan snapshot;
- open drafts;
- workout details.

This is the primary testing layer for database queries.

### Context Builder Tests

Use a fake repository. Verify that the builder:

- always includes `dataAvailability`;
- selects mode-appropriate sections;
- includes plan context only when useful and available;
- includes open drafts when present;
- produces low-data context when history is sparse.

### Service and LLM Contract Tests

Mock the LLM. Verify that the service:

- never sends SQL to the LLM;
- sends only named context sections;
- enforces at most one additional tool call;
- validates tool names and parameters;
- returns caveats for low-data contexts;
- returns structured facts for data lookup questions.

### Manual QA Fixture

Add a seed script later that creates a representative runner:

- 6 weeks of runs;
- a current training plan;
- planned workouts in multiple statuses;
- at least one interval workout with laps;
- at least one open draft run;
- some runs with notes and some without.

Manual prompts:

- "как у меня дела?"
- "покажи интервальные за месяц"
- "что делать завтра?"
- "сколько я пробежал за эту неделю?"
- "разбери последнюю интервальную"

## Migration From Existing Analytics

Keep existing analytics endpoints:

- `/analytics/weekly-summary`
- `/analytics/plan-adherence`
- `/analytics/distance`

The new Runner Intelligence layer can reuse their repository methods where suitable. Over time, duplicated query logic can be consolidated into shared fact/context repository methods.

## Open Implementation Choices

- Whether `QuestionClassifier` starts as pure rules or rules plus LLM classification.
- Whether the new module lives under `src/modules/analytics` or a new `src/modules/runner-intelligence` directory.
- Exact LLM provider configuration and response validation schema.

Recommended MVP defaults:

- start with rule-based classification;
- create `src/modules/runner-intelligence` for the orchestration layer;
- keep reusable data queries in a repository with explicit typed methods;
- add LLM provider configuration only when the context and service tests are in place.
