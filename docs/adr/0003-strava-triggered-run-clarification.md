# ADR 0003: Use Strava Activity Import as the Primary Run Entry Trigger

## Status

Accepted for MVP planning.

## Context

The product is not just another manual running diary. The core behavior should reduce logging friction by reacting to completed workouts that already exist in Strava. The missing value is the subjective and planning context after the workout: perceived effort, notes, whether the workout matched the plan, and how it felt.

## Decision

Use completed Strava activities as the primary trigger for run entry.

When Runlogbook receives a completed Strava activity, it creates a draft run and notifies the user to clarify the workout result.

Manual run creation may remain as a fallback, but it is not the main product workflow.

## Consequences

- Strava integration becomes part of the MVP, not a later enhancement.
- Proper authentication is required earlier because Strava tokens and personal training data must be protected.
- Notifications become core infrastructure because they drive the clarification loop.
- The Training Log model needs a draft or imported state before a run is fully clarified.
- The app can focus on higher-value data that Strava does not capture well.

## Review Trigger

Revisit this decision if early users do not use Strava consistently or if Strava webhook/OAuth setup blocks validation for too long.
