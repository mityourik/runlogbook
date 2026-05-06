# ADR 0006: Start Notifications as In-App Records

## Status

Accepted for MVP implementation.

## Context

Notifications are part of the core Strava clarification workflow. After a completed Strava activity is imported as a draft run, the user must be prompted to add subjective context. External delivery needs provider choices, credentials, unsubscribe behavior, and deliverability handling.

## Decision

Start with persisted in-app notifications in PostgreSQL.

External delivery should be added later through a notification delivery adapter without changing the product event that creates a notification.

## Consequences

- The backend can represent notification state immediately.
- The first UI can show unread prompts without waiting for email or push setup.
- Users will not receive out-of-app prompts until a delivery adapter is added.
- The notification model remains compatible with email, Telegram, mobile push, or other channels later.
