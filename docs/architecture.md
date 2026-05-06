# Architecture

## Recommendation

Start with an API-first modular monolith.

Chosen implementation stack:

- Node.js
- TypeScript
- Fastify
- PostgreSQL

This is the best fit for testing the product with yourself and friends because it keeps deployment and development simple while still preserving clean module boundaries. Microservices would add operational cost too early. A completely unstructured monolith would be faster for the first few days but more expensive once diary, plans, analytics, and imports start pulling in different directions.

## Architectural Style

Use a light Clean Architecture / Hexagonal Architecture approach:

- Domain modules contain business rules and core types.
- Use cases orchestrate application behavior.
- HTTP handlers only validate requests and call use cases.
- Persistence is hidden behind repository interfaces.
- Analytics can start as read-side queries inside the monolith.

Avoid splitting into services until there is concrete pressure: separate scaling needs, different deployment cadence, external integration complexity, or a team boundary.

## Initial Bounded Contexts

### Identity

Responsible for users, authentication, invites, and account-level security.

Initial model:

- User
- Invite
- Session or token

### Integrations

Responsible for external provider connections and imported activities.

Initial model:

- StravaConnection
- StravaActivityImport
- ImportedActivity

The integration context should protect provider tokens and keep Strava-specific details away from Training Log.

### Training Log

Responsible for completed running activities and user clarification after import.

Initial model:

- Run
- DraftRun
- Distance
- Duration
- Pace
- Effort
- RunNote

Most runs should start as imported Strava activities and become clarified runs after the user adds subjective training context.

### Training Plan

Responsible for planned workouts and goal tracking.

Initial model:

- TrainingPlan
- PlannedWorkout
- WorkoutStatus
- Goal

Plans are entered manually or pasted from an external source in the MVP. Automatic plan generation is deferred.

### Analytics

Responsible for derived metrics and progress views.

Initial model:

- WeeklySummary
- PlanAdherence
- ProgressTrend

Analytics should compare completed clarified runs against the current training plan when possible.

### Notifications

Responsible for prompting users to clarify imported workouts.

Initial model:

- Notification
- NotificationDelivery
- NotificationPreference

Email is the likely first delivery channel, but the domain should not depend on a specific provider.

Analytics should not own the source data. It reads from Training Log and Training Plan data through explicit queries or projections.

## Suggested API Surface

### Identity

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /me`

### Integrations

- `GET /integrations/strava/connect`
- `GET /integrations/strava/callback`
- `GET /integrations/strava/webhook`
- `POST /integrations/strava/webhook`

### Runs

- `GET /runs/drafts`
- `POST /runs/drafts/{draftRunId}/clarify`
- `POST /runs`
- `GET /runs`
- `GET /runs/{runId}`
- `PATCH /runs/{runId}`
- `DELETE /runs/{runId}`

Run endpoints use authenticated user context.

### Plans

- `POST /training-plans`
- `GET /training-plans/current`
- `POST /training-plans/{planId}/workouts`
- `PATCH /planned-workouts/{workoutId}`
- `POST /planned-workouts/{workoutId}/complete`

### Analytics

- `GET /analytics/weekly-summary`
- `GET /analytics/progress`
- `GET /analytics/plan-adherence`

### Notifications

- `GET /notifications`
- `POST /notifications/{notificationId}/read`

## Data Ownership

- Identity owns users and authentication state.
- Integrations owns Strava connection state, provider tokens, and imported provider payloads.
- Training Log owns completed runs.
- Training Plan owns planned workouts and plan status.
- Analytics owns calculated views only, not canonical run or plan data.
- Notifications owns delivery attempts and user notification preferences.

## Persistence Strategy

Start with one relational database.

Chosen database: PostgreSQL.

Recommended early tables:

- `users`
- `sessions` or equivalent auth state
- `strava_connections`
- `strava_activity_imports`
- `draft_runs`
- `runs`
- `run_clarifications` if clarification history matters; otherwise fields can live on `runs`
- `training_plans`
- `planned_workouts`
- `notifications`
- `analytics_snapshots` only if live queries become slow or complicated

Do not introduce event sourcing, queues, separate read databases, or service-to-service communication for the MVP.

## Testing Strategy

- Unit test domain rules without database or HTTP.
- Use case tests should run with in-memory repositories.
- API tests should cover the main user flows.
- Keep analytics tests data-driven with small fixed datasets.

## Open Decisions

- Strava OAuth implementation details and token refresh strategy.
- First notification channel and provider.
- Whether the first UI should be web, PWA, mobile, or a simple client.
- How pasted training plans should be parsed in the first version.

## Architecture Decision

Current decision: API-first modular monolith for MVP validation.

Review this decision after the first 3-5 external users have used the product for at least 2 weeks.
