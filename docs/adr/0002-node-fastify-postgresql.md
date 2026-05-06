# ADR 0002: Use Node.js, Fastify, TypeScript, and PostgreSQL

## Status

Accepted for MVP implementation.

## Context

The backend should be API-first and easy to evolve while validating the product with a small group of users. The selected database is PostgreSQL. The codebase should remain lightweight enough for fast iteration and structured enough to avoid mixing HTTP, persistence, and domain behavior.

## Decision

Use Node.js with TypeScript, Fastify for HTTP APIs, and PostgreSQL as the primary database.

## Rationale

- Node.js is a pragmatic fit for fast API development.
- TypeScript gives strong editor support and catches common integration mistakes early.
- Fastify is lightweight, fast, and less prescriptive than NestJS.
- PostgreSQL is a strong default for relational product data, constraints, analytics queries, and future JSONB usage if needed.

## Consequences

- We keep framework overhead low during MVP validation.
- We need to be disciplined about module boundaries because Fastify does not enforce architecture by itself.
- PostgreSQL constraints can protect core data quality from the beginning.
- If the product grows, the same API can later support web, PWA, mobile, or external integrations.
