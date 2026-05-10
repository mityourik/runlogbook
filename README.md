# Runlogbook

Runlogbook is an API-first running logbook application for validating a personal training workflow with a small group of early users.

The first product direction combines:

- Running diary: workouts, distance, pace, effort, notes, and how the runner felt.
- Training plan: simple goals, planned workouts, and completion tracking.
- Running analytics: progress, consistency, volume, and basic trends.

The initial architecture is documented in `docs/architecture.md`.

## Development

Install dependencies:

```bash
npm install
```

Start PostgreSQL:

```bash
docker compose up -d
```

Run the API:

```bash
npm run dev
```

Apply migrations:

```bash
npm run db:migrate
```

Run a basic API smoke test:

```bash
npm run smoke
```

Manage Strava webhook subscriptions:

```bash
npm run strava:subscriptions -- list
npm run strava:subscriptions -- create
npm run strava:subscriptions -- delete {subscriptionId}
```

Strava integration notes are documented in `docs/strava-integration.md`.

Available endpoints:

- `GET /health`
- `GET /health/db`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /me`
- `GET /integrations/strava/connect`
- `GET /integrations/strava/callback`
- `GET /integrations/strava/webhook`
- `POST /integrations/strava/webhook`
- `GET /notifications`
- `POST /notifications/{notificationId}/read`
- `GET /runs/drafts`
- `POST /runs/drafts/{draftRunId}/clarify`
- `POST /training-plans`
- `GET /training-plans/current`
- `POST /training-plans/{planId}/workouts`
- `PATCH /planned-workouts/{workoutId}`
- `GET /analytics/weekly-summary`
- `GET /analytics/plan-adherence`
- `POST /runs`
- `GET /runs`
- `GET /runs/{runId}`
- `PATCH /runs/{runId}`
- `DELETE /runs/{runId}`

Run endpoints require an `Authorization: Bearer {token}` header from `POST /auth/register` or `POST /auth/login`.
