# Analytics Query Router Design

## Context

Runlogbook already has an analytics module with fixed endpoints for weekly summary, plan adherence, and distance summaries. The next step is to let users type natural-language analytics questions while keeping database access constrained to known, safe backend queries.

The first version should return structured data only. It should not generate coaching advice, narrative interpretation, or SQL from user input.

## Decision

Use a hybrid analytics intent router.

The backend will first try deterministic rules for common questions. If rules do not confidently classify the question, the backend will call an LLM classifier. The LLM may only choose from an allowlist of analytics intents and parameters. It must not generate SQL. The backend validates the LLM response, resolves periods, and executes only predefined repository methods.

## API

Add `POST /analytics/query`.

Request:

```json
{
  "question": "сколько я пробежал за эту неделю?"
}
```

Answered response:

```json
{
  "status": "answered",
  "question": "сколько я пробежал за эту неделю?",
  "resolved": {
    "source": "rules",
    "intents": [
      {
        "name": "distance_summary",
        "parameters": {
          "period": "this_week",
          "startDate": "2026-05-11",
          "endDate": "2026-05-17"
        },
        "confidence": 0.94
      }
    ]
  },
  "results": [
    {
      "intent": "distance_summary",
      "data": {
        "startDate": "2026-05-11",
        "endDate": "2026-05-17",
        "runCount": 4,
        "totalDistanceMeters": 42000,
        "totalDistanceKm": 42,
        "runs": []
      }
    }
  ]
}
```

Clarification response:

```json
{
  "status": "needs_clarification",
  "question": "как у меня с тренировками?",
  "options": [
    {
      "label": "Километраж за эту неделю",
      "intents": [
        {
          "name": "distance_summary",
          "parameters": { "period": "this_week" }
        }
      ]
    },
    {
      "label": "Выполнение плана",
      "intents": [
        {
          "name": "plan_adherence",
          "parameters": {}
        }
      ]
    },
    {
      "label": "Разбивка по типам за эту неделю",
      "intents": [
        {
          "name": "workout_type_breakdown",
          "parameters": { "period": "this_week" }
        }
      ]
    }
  ]
}
```

Clarification follow-up uses the same endpoint with a selected executable option:

```json
{
  "question": "как у меня с тренировками?",
  "selectedOption": {
    "intents": [
      {
        "name": "workout_type_breakdown",
        "parameters": { "period": "this_week" }
      }
    ]
  }
}
```

Rules:

- `status` is either `answered` or `needs_clarification`.
- `resolved.source` is `rules`, `llm`, or `user_selection`.
- `results[]` is always tied to a specific intent.
- Unknown intents and malformed parameters are rejected before execution.
- The response contains data only, not explanatory prose.

## Intent Catalog

The first catalog should cover core running analytics, plan analytics, workout kinds, and workout lap data.

| Intent | Purpose | Parameters |
| --- | --- | --- |
| `distance_summary` | Distance and runs for a period | `period`, `startDate`, `endDate` |
| `run_count_summary` | Run count for a period | `period`, `startDate`, `endDate` |
| `duration_summary` | Total running time for a period | `period`, `startDate`, `endDate` |
| `pace_summary` | Average pace for a period | `period`, `startDate`, `endDate` |
| `weekly_summary` | Weekly aggregate: count, distance, duration, longest run, pace, effort | `weekStart` |
| `longest_run` | Longest run in a period | `period`, `startDate`, `endDate` |
| `effort_summary` | Average effort and effort distribution | `period`, `startDate`, `endDate` |
| `plan_adherence` | Current plan adherence | optional `period` |
| `planned_vs_actual` | Planned workouts compared with completed runs | `period`, `startDate`, `endDate` |
| `workout_type_breakdown` | Metrics grouped by `easy`, `workout`, `long`, `race`, `other` | `period`, optional `workoutKind` |
| `workout_summary` | Quality workouts for a period | `period`, `startDate`, `endDate` |
| `lap_summary` | Workout laps grouped by run | `period`, optional `runId` |

Examples:

- “сколько я пробежал за неделю?” maps to `distance_summary`.
- “какой у меня был средний темп в апреле?” maps to `pace_summary`.
- “как я выполняю план?” maps to `plan_adherence`.
- “покажи интервальные за месяц” maps to `workout_summary`, and may also map to `lap_summary` if the user asks for intervals or laps.
- “что было с тренировками по типам за последние 4 недели?” maps to `workout_type_breakdown`.
- “сравни план и факт на этой неделе” maps to `planned_vs_actual`.

## Data Flow

1. The user enters a question in the UI.
2. The UI sends `POST /analytics/query` with `question`.
3. The backend normalizes the question.
4. `RuleBasedAnalyticsClassifier` checks common Russian-language patterns.
5. If rules produce a confident classification, the backend skips the LLM.
6. If rules do not classify confidently, `LlmAnalyticsClassifier` receives the question and the intent catalog.
7. The LLM returns strict JSON with intents, parameters, confidence, and possible clarification options.
8. The backend validates the response with Zod.
9. The backend resolves periods into concrete dates.
10. If confidence is low or parameters conflict, the API returns `needs_clarification`.
11. If the request is executable, `AnalyticsQueryExecutor` calls the appropriate `AnalyticsRepository` methods.
12. The API returns structured data.

Components:

- `AnalyticsIntentCatalog`: allowed intents, descriptions, parameters, and examples.
- `RuleBasedAnalyticsClassifier`: deterministic rules for frequent questions.
- `LlmAnalyticsClassifier`: fallback classifier that returns allowlisted JSON only.
- `AnalyticsQueryExecutor`: maps intents to repository methods.
- `AnalyticsRepository`: owns predefined SQL queries.
- `AnalyticsClarificationBuilder`: builds executable clarification options.

Multiple intents are allowed when the question explicitly asks for multiple metrics, such as distance and pace. If intents or periods conflict, the API should return clarification instead of guessing.

## Query Set

Existing repository methods can be reused:

- `getWeeklySummary`
- `getCurrentPlanAdherence`
- `getDistanceSummary`

Add repository methods for missing intent coverage:

| Intent | Repository method | Result |
| --- | --- | --- |
| `run_count_summary` | `getRunCountSummary` | Count for a period |
| `duration_summary` | `getDurationSummary` | Total duration and runs |
| `pace_summary` | `getPaceSummary` | Average pace and per-run pace |
| `longest_run` | `getLongestRun` | Longest run or tied longest runs |
| `effort_summary` | `getEffortSummary` | Average effort and distribution |
| `planned_vs_actual` | `getPlannedVsActual` | Planned workouts and matched actual runs |
| `workout_type_breakdown` | `getWorkoutTypeBreakdown` | Count, distance, and duration by workout kind |
| `workout_summary` | `getWorkoutSummary` | `workout` kind runs for a period |
| `lap_summary` | `getLapSummary` | Workout laps grouped by run |

Supported period values:

- `today`
- `yesterday`
- `this_week`
- `last_week`
- `this_month`
- `last_month`
- `last_7_days`
- `last_30_days`
- explicit `startDate` and `endDate`

Default period behavior:

- “за неделю” means `this_week`.
- “за последние 7 дней” means `last_7_days`.
- “за месяц” means `this_month`.
- Ambiguous phrases such as “недавно” and “в последнее время” should trigger clarification.

Plan comparison behavior:

- If a completed run is linked to `planned_workout_id`, use that link.
- If no link exists, show planned workouts and same-day runs together with `matchStatus: "same_day"`.
- If no reasonable same-day match exists, return `matchStatus: "unmatched"`.
- Do not silently infer perfect matches from vague data.

Workout and lap behavior:

- `workout_summary` filters `runs.workout_kind = 'workout'`.
- `workout_type_breakdown` groups by `workout_kind`.
- `lap_summary` reads `workout_laps` only for the authenticated user's workout runs.

## Clarification Behavior

Clarification is a normal product state, not an error.

Return `needs_clarification` when:

- Classifier confidence is low.
- Several intents are plausible but the question does not request all of them.
- The period is ambiguous.
- The object is ambiguous, such as “тренировки”.
- Parameters conflict.
- A required parameter is missing.

Clarification options:

- Return 2-3 options maximum.
- Each option contains executable intent payload.
- UI may display only `label`.
- Labels must be explicit for period choices.

If the system can answer safely with a clear default, it should answer instead of clarifying. For example, “километраж за неделю” uses `this_week`.

## LLM Constraints

The LLM classifier must operate as a constrained classifier.

It receives:

- The user's question.
- The allowlisted intent catalog.
- The allowed period values.
- Instructions to return strict JSON only.

It must not receive instructions to generate SQL, and backend must reject any response containing unknown intents, raw SQL, or unexpected fields.

LLM calls should be skipped when rules classify confidently. Real LLM calls should not be part of the default automated test suite.

## Testing

Test the boundaries and contracts rather than model intelligence.

Required tests:

- Intent catalog entries have descriptions, allowed parameters, examples, and executor mappings.
- Rule classifier maps common Russian formulations without LLM.
- LLM adapter validates JSON and rejects unknown intents, raw SQL, and unexpected fields.
- Query executor calls the correct repository method for each intent.
- Period resolver handles supported periods and explicit dates.
- Clarification builder returns at most 3 executable options.
- API covers `answered`, `needs_clarification`, and `selectedOption` flows.
- Repository tests run against a small fixed dataset.

Security tests:

- A prompt asking to execute SQL does not reach the executor.
- An LLM response with `intent: "raw_sql"` is rejected.
- `lap_summary` for another user's `runId` returns no cross-user data.

## Out Of Scope

- Free-form SQL generation.
- Narrative coaching advice.
- Long-term trend interpretation beyond returned metrics.
- Perfect automatic plan/run matching when no explicit link exists.
- Calling the real LLM in regular automated tests.
