# ADR 0004: Use Server-Side Bearer Sessions for MVP Authentication

## Status

Accepted for MVP implementation.

## Context

Runlogbook stores personal training data and will connect to Strava accounts. The MVP needs real user separation and revocable sessions without adding unnecessary identity infrastructure.

## Decision

Use email/password authentication with opaque bearer session tokens.

The client receives the raw session token once. The database stores only a SHA-256 hash of the token. Sessions expire after 30 days and can be revoked by deleting the server-side session row.

## Consequences

- Sessions are easy to revoke on logout or suspicious activity.
- We avoid putting user claims into long-lived JWTs during early product development.
- Every authenticated request requires a database lookup.
- Password reset, email verification, MFA, and OAuth login are deferred.
