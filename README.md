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

Create a local `.env` file from `.env.example` and fill Strava values if you need Strava OAuth or webhooks:

```bash
cp .env.example .env
```

Start PostgreSQL:

```bash
docker compose up -d
```

Apply migrations:

```bash
npm run db:migrate
```

Run the API:

```bash
npm run dev
```

Run the web app in another terminal:

```bash
npm run web:dev
```

Open the app at `http://localhost:5173`.

The API runs at `http://localhost:3000` by default.

### Local Strava Webhooks

Strava webhooks require a public HTTPS callback URL. For local development, keep the API running and start a public tunnel to `localhost:3000` in another terminal.

One working option is `localhost.run`:

```bash
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:localhost:3000 nokey@localhost.run
```

Copy the generated HTTPS URL, for example `https://example.lhr.life`, and set it in `.env`:

```env
APP_BASE_URL=https://example.lhr.life
```

Restart the API after changing `.env`.

Then recreate the Strava webhook subscription:

```bash
npm run strava:subscriptions -- list
npm run strava:subscriptions -- delete {subscriptionId}
npm run strava:subscriptions -- create
npm run strava:subscriptions -- list
```

Verify the public URL reaches the local API:

```bash
curl https://example.lhr.life/health
```

Expected response:

```json
{"status":"ok"}
```

The tunnel URL is temporary. If the tunnel process stops, Strava can no longer deliver webhooks and you must create a new tunnel and recreate the subscription.

### Stop Local Development

Stop foreground processes with `Ctrl+C` in their terminals:

- `npm run dev`
- `npm run web:dev`
- `ssh ... localhost.run`

Stop PostgreSQL:

```bash
docker compose down
```

If you started a tunnel in the background, find and stop it:

```bash
pgrep -fl "localhost.run|cloudflared|ngrok|localtunnel"
kill {processId}
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
- `GET /analytics/distance`
- `POST /runs`
- `GET /runs`
- `GET /runs/{runId}`
- `PATCH /runs/{runId}`
- `DELETE /runs/{runId}`

Run endpoints require an `Authorization: Bearer {token}` header from `POST /auth/register` or `POST /auth/login`.
