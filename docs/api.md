# API

Base URL (local): `http://localhost:4000`

Version prefix: `/api/v1`

## Auth

- `POST /api/v1/auth/login`
- `GET /api/v1/me`

## Buildings / Units / Meters

- `GET /api/v1/buildings`
- `POST /api/v1/buildings`
- `GET /api/v1/buildings/:id`
- `GET /api/v1/units`
- `POST /api/v1/units`
- `GET /api/v1/meters`
- `POST /api/v1/meters`
- `GET /api/v1/meters/:id`

## Gateways

- `GET /api/v1/gateways`
- `POST /api/v1/gateways`

## Ingestion and readings

- `POST /api/v1/ingestion/readings`
- `GET /api/v1/ingestion/raw-events`
- `POST /api/v1/ingestion/raw-events/reprocess`
- `POST /api/v1/readings/manual`
- `POST /api/v1/readings/import-csv`
- `GET /api/v1/readings?meter_id=&from=&to=`

## Dashboard

- `GET /api/v1/dashboard/overview`
- `GET /api/v1/dashboard/buildings/:id/consumption?from=&to=`
- `GET /api/v1/dashboard/meters/:id/timeseries?from=&to=`

## Billing and tariffs

- `GET /api/v1/tariffs`
- `POST /api/v1/tariffs`
- `GET /api/v1/tax-profiles`
- `POST /api/v1/tax-profiles`
- `GET /api/v1/allocation-keys`
- `POST /api/v1/allocation-keys`
- `GET /api/v1/operating-cost-components`
- `POST /api/v1/operating-cost-components`
- `GET /api/v1/billing-periods`
- `POST /api/v1/billing-periods`
- `POST /api/v1/billing/generate-drafts`
- `GET /api/v1/invoice-drafts`
- `GET /api/v1/invoice-drafts/:id`
- `GET /api/v1/billing-change-log`

## Meter lifecycle and reading adjustments

- `GET /api/v1/meter-replacement-events`
- `POST /api/v1/meter-replacement-events`
- `GET /api/v1/readings/corrections`
- `POST /api/v1/readings/estimated`
- `POST /api/v1/readings/:id/corrections`

## Audit

- `GET /api/v1/audit-log`

## Admin helpers (MVP)

- `GET /api/v1/admin/tenants`
- `GET /api/v1/admin/users`
- `POST /api/v1/admin/users`
- `GET /api/v1/admin/gateways`
- `GET /api/v1/admin/api-keys`
- `POST /api/v1/admin/api-keys`

## Exports

- `GET /api/v1/exports/readings.csv`
- `GET /api/v1/exports/invoice-drafts.csv`
- `GET /api/v1/exports/invoice-drafts/:id/pdf`
- `GET /api/v1/exports/integrations.json`
- `GET /api/v1/exports/calculation-breakdowns.json`

## Ingestion contract

### Single payload

```json
{
  "meter_external_id": "heat-main-001",
  "timestamp": "2026-03-11T12:00:00Z",
  "value": 14234.45,
  "unit": "kWh",
  "quality_flag": "ok"
}
```

### Batch payload

```json
{
  "gateway_serial": "rpi5-lu-001",
  "readings": [
    {
      "meter_external_id": "heat-main-001",
      "timestamp": "2026-03-11T12:00:00Z",
      "value": 14234.45,
      "unit": "kWh",
      "quality_flag": "ok"
    }
  ]
}
```

### Response (example)

```json
{
  "status": "partial_success",
  "attempted": 2,
  "accepted": 1,
  "rejected": 1,
  "idempotent": 0,
  "errors": [
    {
      "index": 1,
      "meter_external_id": "unknown-xyz",
      "message": "Unknown meter_external_id for this tenant"
    }
  ]
}
```

## Raw ingestion events

### `GET /api/v1/ingestion/raw-events`

Role: `admin` or `manager`

Query params:

- `limit` (default `100`, max `500`)
- `from`, `to` (ISO timestamp)
- `processing_status` (`accepted`, `rejected`, `error`, `reprocess_requested`)
- `source` (`api`, `gateway`, `manual`, `import`)
- `gateway_id`
- `meter_external_id`
- `correlation_id`
- `include_payload` (`true|false`)

### `POST /api/v1/ingestion/raw-events/reprocess`

Role: `admin` or `manager`

Payload (one selector is required):

```json
{
  "raw_event_ids": ["8f8f3c50-5e0c-4a2f-b6f8-0db7a72cb8f8"],
  "correlation_id": "2f69f954-96eb-4ce4-8f96-d1f739af5d8f",
  "reason": "operator replay after meter mapping fix"
}
```

Current behavior:

- marks selected events as `reprocess_requested`
- calls ingestion reprocessing boundary (stub)
- writes audit log entry
