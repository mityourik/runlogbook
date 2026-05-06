# ADR 0005: Store Strava OAuth Tokens Encrypted

## Status

Accepted for MVP implementation.

## Context

Runlogbook needs Strava access and refresh tokens to import completed activities. These tokens grant access to personal training data and must not be stored as plaintext secrets.

## Decision

Encrypt Strava access and refresh tokens before storing them in PostgreSQL.

The application derives an AES-256-GCM key from `APP_SECRET`. Token rows are still owned by the `strava_connections` table and associated with a Runlogbook user.

## Consequences

- A database leak alone does not expose usable Strava tokens.
- `APP_SECRET` becomes sensitive production configuration and must be protected.
- Rotating `APP_SECRET` will require a token re-encryption process or reconnecting Strava accounts.
