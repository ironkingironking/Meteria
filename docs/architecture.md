# Architecture

## High-level design

Meteria is built as a modular monorepo with clear boundaries:

- `apps/api`: Fastify REST API, auth, tenant scoping, ingestion, billing orchestration
- `apps/web`: Next.js admin dashboard for operations and billing workflows
- `apps/worker`: periodic background jobs (gateway health checks, billing queue placeholder)
- `packages/db`: Prisma schema/client + Timescale post-migrate setup + seed
- `packages/billing-engine`: reusable consumption and pricing logic
- `packages/types`: shared domain typing
- `packages/utils`: shared helpers (CSV, number utils)

## API and domain boundaries

To keep modules replaceable, Meteria follows explicit boundaries:

- API layer (`apps/api/src/modules/*/route.ts`): transport, validation, auth checks
- Application/domain layer (`packages/billing-engine`, module services): business logic
- Infrastructure layer (`packages/db`, adapters, docker): persistence/runtime

Critical separation already in place:

- ingestion paths are isolated from dashboard read models
- ingestion writes both canonical meter readings and raw event journal rows
- billing computation lives in `packages/billing-engine` and is invoked via ports
- dashboard endpoints consume persisted data without mutating ingestion workflows

## Multi-tenancy model

Tenant isolation is enforced by:

1. tenant-linked entities (`tenant_id` on all tenant-owned tables)
2. auth context carrying `tenantId`
3. API query patterns that always filter by current `tenantId`
4. ingestion credentials resolved to exactly one tenant

## Auth and security

- User auth: JWT bearer tokens (`/api/v1/auth/login`)
- Device auth: `x-api-key` and `x-gateway-token`
- Passwords hashed with bcrypt
- Opaque keys/tokens stored hashed (SHA-256)
- Fastify global rate limiting
- CORS by environment
- Zod validation on payloads
- Audit logging for important write actions

## Time-series strategy

`meter_readings` is designed for high ingest throughput:

- hypertable conversion via Timescale (`create_hypertable`)
- composite uniqueness for idempotency (`meter_id`, `timestamp`, `value`)
- descending indexes for recent-read queries
- optimized filtered queries by `tenant_id`, `meter_id`, `timestamp`

## Billing engine design

The billing package separates calculation from HTTP handlers:

- reading semantics:
  - cumulative = end - start
  - interval = sum(values)
- tariff application:
  - `flat_per_unit`
  - `monthly_fixed_plus_usage`
- output includes structured calculation breakdown and warning flags

### Prepared legal-compliance boundaries (DACH/CH)

`packages/billing-engine` now exposes replaceable ports/interfaces for:

- allocation key resolution
- operating cost component resolution (fixed/variable)
- tax policy resolution (handling mode + profile selection)
- reading correction lineage lookup
- meter replacement event lookup
- immutable calculation snapshot writing

Current implementations are intentionally conservative defaults with explicit TODO markers for later legal rule engines.

Service boundaries are intentionally wired through a composition root (`apps/api/src/modules/billing/service-boundaries.ts`) so regional engines can replace defaults without rewriting route handlers.

Ingestion replay is also isolated through a boundary (`apps/api/src/modules/ingestion/service-boundaries.ts`) so queue-driven reprocessing can be introduced without rewriting API endpoints.

This allows later extension for:

- tiered pricing
- allocation keys
- regional billing rules
- invoice finalization workflow
- annual statement assembly
- correction and replacement reconciliation
- jurisdiction-specific tax handling

## Deployment topology

Docker Compose services:

- `postgres` (TimescaleDB)
- `api`
- `web`
- `worker`
- optional `caddy`

Target: single Ubuntu/Debian host (Hetzner VPS or dedicated).

## Billing auditability

Two logs are kept by design:

- `audit_logs`: generic operational audit trail
- `billing_change_logs`: structured billing-relevant changes for legal traceability

Billing-relevant entities (tax profiles, allocation keys, operating cost components, meter replacements, reading corrections, draft generation) write to `billing_change_logs`.
