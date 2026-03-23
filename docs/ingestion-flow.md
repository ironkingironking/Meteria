# Ingestion flow

## Overview

Ingestion is intentionally isolated from dashboard and billing reads.

Main path:

1. gateway or API key authenticates (`x-gateway-token` or `x-api-key`)
2. payload is validated (single or batch format)
3. gateway serial is resolved and cross-checked
4. meter external IDs are resolved per tenant
5. readings are validated (tenant scope + timestamp window)
6. normalized readings are inserted idempotently into `meter_readings`
7. raw events are persisted into `raw_meter_events` for replay/audit
8. gateway heartbeat (`last_seen_at`) is updated
9. audit log entry is written

## Idempotency

`meter_readings` enforces idempotency using:

- unique key: (`meter_id`, `timestamp`, `value`)
- `createMany` with `skipDuplicates: true`

Response fields expose:

- `accepted`
- `rejected`
- `idempotent`

## Raw event journal

Every normalized reading is written to `raw_meter_events` with:

- `correlation_id` for batch tracing
- `processing_status` (`accepted`, `rejected`, `error`, `reprocess_requested`)
- optional error payload for rejected events

This creates a replayable trail for future high-assurance billing workflows.

## Reprocess boundary

Endpoint:

- `POST /api/v1/ingestion/raw-events/reprocess`

Current implementation marks matching rows with `reprocess_requested` and calls a stubbed port in:

- `apps/api/src/modules/ingestion/service-boundaries.ts`

TODO:

- connect to worker queue
- add retry policy and dead-letter handling
- add operator UI actions for replay windows

