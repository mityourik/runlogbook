# ADR 0001: Start With an API-First Modular Monolith

## Status

Accepted for MVP planning.

## Context

The application starts as a running logbook for personal use and early testing with friends. The first product areas are running diary, training plans, and running analytics. The project needs to validate whether the workflow is useful before investing in platform-specific UI, integrations, or distributed infrastructure.

## Decision

Build the MVP as an API-first modular monolith.

The backend will expose the product through HTTP APIs and keep domain areas separated as modules: Identity, Training Log, Training Plan, and Analytics.

## Consequences

- Deployment stays simple during validation.
- The API can support a future web, PWA, mobile app, or scripts without rewriting the core product logic.
- Module boundaries reduce the risk of a tangled monolith.
- Microservices are intentionally deferred until there is real scaling, team, or integration pressure.
- Some boundaries will be enforced by discipline and tests rather than infrastructure.

## Review Trigger

Revisit this decision after 3-5 external users have used the app for at least 2 weeks, or earlier if one module develops substantially different operational needs.
