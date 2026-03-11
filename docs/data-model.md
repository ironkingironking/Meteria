# Data model

Core entities are implemented in Prisma (`packages/db/prisma/schema.prisma`).

## Tenant

Tenant root for all scoped resources.

## User

- tenant-linked users with role-based access (`admin`, `manager`, `viewer`)
- password hash only (no plaintext)

## Building and Unit

- buildings belong to tenant
- units belong to building

## Meter

- scoped by tenant + building
- optional unit link
- supports meter type, direction, reading mode, multiplier

## Gateway

- scoped by tenant
- optional building link
- hashed auth token
- status + last_seen tracking

## MeterReading

Timeseries table with:

- tenant + meter + optional gateway
- timestamp + value + quality/source flags
- idempotency unique index on (`meter_id`, `timestamp`, `value`)
- Timescale hypertable conversion script
- lifecycle state for billing lineage (`original`, `estimated`, `corrected`, `superseded`)
- optional supersession link for corrected readings

## Tariff

- tenant-scoped pricing configuration by meter type
- validity windows + pricing model fields
- optional tax profile binding

## TaxProfile

- tenant-level tax handling policy (`exclusive`, `inclusive`, `exempt`, `reverse_charge`)
- country and validity windows
- default profile support

## TenantAllocationKey and TenantAllocationKeyEntry

- defines allocation methodology per tenant/building
- supports area, occupancy, unit count, custom, meter-weighted strategies
- stores explicit per-unit shares/basis values

## OperatingCostComponent

- fixed/variable cost components with optional meter type binding
- optional allocation key and tax profile linkage
- validity windows and formula template placeholder

## BillingPeriod

- tenant + building billing windows
- period type (`monthly`, `quarterly`, `annual`, `custom`)
- fiscal year support

## InvoiceDraft

- generated drafts by period/building/unit
- totals, tax, status, warnings
- JSON calculation breakdown
- optional tax profile + tax handling mode snapshot

## MeterReplacementEvent

- records old/new meter transitions with replacement timestamp and carry-over readings
- required for legally traceable cumulative reading continuity

## ReadingCorrectionEvent

- links original and corrected readings with correction type + reason
- preserves immutable correction lineage for audit and exports

## CalculationBreakdownSnapshot

- immutable export-ready calculation snapshot per billing run/draft
- allows later signed export pipelines (CSV/PDF/JSON)

## BillingChangeLog

- structured log for every billing-relevant data change
- designed for future legal evidence and workflow approvals

## AuditLog

- append-only action journal for traceability

## ApiKey

- tenant-scoped hashed keys for ingestion clients

## Notes for extension

The current schema is intentionally compatible with future additions:

- allocation keys and tenant cost splitting
- invoice line-item tables
- external accounting mappings
- IoT protocol-specific metadata
- anomaly score tables and ML outputs
