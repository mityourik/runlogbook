# Strava Integration

## What Strava Sends Through Webhooks

Strava webhook events are lightweight notifications. They do not include full activity details.

Webhook event fields:

- `object_type`: `activity` or `athlete`
- `object_id`: activity id or athlete id
- `aspect_type`: `create`, `update`, or `delete`
- `owner_id`: Strava athlete id
- `event_time`: Unix timestamp
- `subscription_id`: webhook subscription id
- `updates`: changed fields for update events

For activity events, Runlogbook must use `object_id` plus the athlete's stored OAuth token to call Strava's activity API.

## What We Can Read From Activity Details

`GET /api/v3/activities/{id}` returns a detailed activity owned by the authenticated athlete.

Useful fields for Runlogbook MVP:

- `id`
- `name`
- `type`
- `sport_type`
- `start_date`
- `start_date_local`
- `timezone`
- `distance`
- `moving_time`
- `elapsed_time`
- `total_elevation_gain`
- `average_speed`
- `max_speed`
- `average_heartrate` when available
- `max_heartrate` when available
- `calories` when available
- `manual`
- `private`
- `trainer`
- `commute`
- `description`
- `map.summary_polyline` when available
- `splits_metric` when available
- `laps` when available

Runlogbook currently stores the full activity response in `draft_runs.raw_activity` and maps the core objective fields into structured columns.

## Scopes

Required MVP scopes:

- `read`: basic profile/public data needed by OAuth flow.
- `activity:read`: read activities visible to Everyone or Followers and receive activity webhooks.
- `activity:read_all`: read Only You activities and receive privacy-related updates.

Recommended requested scope for MVP:

```text
read,activity:read,activity:read_all
```

Users can uncheck requested scopes in Strava. The callback must store the actually granted scope for diagnostics.

## OAuth Setup

Strava application settings must include an authorization callback domain matching `APP_BASE_URL`.

For local development, Strava allows `localhost` and `127.0.0.1` for OAuth callbacks. Webhooks still need a public HTTPS callback URL, so local webhook testing requires a tunnel such as ngrok or Cloudflare Tunnel.

Application env values:

- `APP_BASE_URL`: public base URL for OAuth callback and webhook callback.
- `STRAVA_CLIENT_ID`: Strava app client id.
- `STRAVA_CLIENT_SECRET`: Strava app client secret.
- `STRAVA_WEBHOOK_VERIFY_TOKEN`: arbitrary secret string echoed during webhook subscription verification.

## Webhook Subscription

One Strava application can have one webhook subscription. That subscription receives supported events for all athletes who authorized the app.

Callback URL:

```text
{APP_BASE_URL}/integrations/strava/webhook
```

Supported MVP events:

- `activity:create`: fetch activity details and create/update `draft_run`.
- `activity:update`: store event for now; later update draft/finalized run if relevant.
- `activity:delete`: store event for now; later mark imported activity deleted.
- `athlete:update` with deauthorization: later remove/revoke connection.
