# Meteria MVP

Meteria is a self-hosted multi-tenant SaaS MVP for digital metering, time-series monitoring, and billing support for property managers, cooperatives, SMEs, mixed-use buildings, and small utilities.

## Stack

- Backend: Node.js + TypeScript + Fastify
- Database: PostgreSQL + TimescaleDB + Prisma
- Frontend: Next.js + TypeScript + Recharts
- Worker: Node.js service for periodic jobs
- Validation: Zod
- Logging: structured JSON via Fastify/Pino
- Deployment: Docker Compose

## DACH/Swiss-ready foundation (prepared, not fully implemented)

The MVP now includes structural groundwork for:

- annual billing periods (`period_type`, `fiscal_year`)
- tenant allocation keys + allocation entries
- fixed/variable operating cost components
- tax profiles and tax handling mode snapshots
- meter replacement event tracking
- estimated/corrected reading lifecycle and correction events
- immutable calculation breakdown snapshots
- structured billing change logs for legal traceability

## Monorepo structure

```txt
meteria/
  apps/
    api/
    web/
    worker/
  gateway/
  packages/
    db/
    types/
    utils/
    billing-engine/
  infra/
    docker/
    scripts/
  docs/
```

## Quickstart (local)

1. Copy env file:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npm install
```

3. Generate Prisma client and apply schema:

```bash
npm run db:generate
npm run db:migrate
```

4. Seed demo data:

```bash
npm run db:seed
```

5. Start services in development:

```bash
npm run dev
```

- API: `http://localhost:4000`
- Web: `http://localhost:3000`

## Docker deployment

```bash
docker compose up -d --build
```

This starts:

- `postgres` (TimescaleDB)
- `api`
- `web`
- `worker`

Optional Caddy reverse proxy is available in `docker-compose.yml` and `infra/docker/Caddyfile`.

## Demo credentials

- Tenant slug: `demo-tenant`
- Admin email: `admin@demo.meteria.local`
- Admin password: `ChangeMe123!`

## Seeded scenario

The seed script creates:

- 1 tenant
- 2 buildings
- 3 units
- 7 meters
- 2 gateways
- historical readings (cumulative and interval)
- 1 tariff
- 1 billing period
- 1 invoice draft
- 1 API key

## API examples

Login:

```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@demo.meteria.local","password":"ChangeMe123!","tenant_slug":"demo-tenant"}'
```

Ingestion (single):

```bash
curl -X POST http://localhost:4000/api/v1/ingestion/readings \
  -H 'content-type: application/json' \
  -H 'x-api-key: mtr_demoapikey_1234567890abcdef1234567890abcdef' \
  -d '{"meter_external_id":"heat-main-001","timestamp":"2026-03-11T12:00:00Z","value":14234.45,"unit":"kWh","quality_flag":"ok"}'
```

Ingestion (batch):

```bash
curl -X POST http://localhost:4000/api/v1/ingestion/readings \
  -H 'content-type: application/json' \
  -H 'x-gateway-token: gtw_demo_a_token' \
  -d '{"gateway_serial":"rpi5-lu-001","readings":[{"meter_external_id":"heat-main-001","timestamp":"2026-03-11T12:00:00Z","value":14234.45,"unit":"kWh","quality_flag":"ok"},{"meter_external_id":"water-cold-002","timestamp":"2026-03-11T12:00:00Z","value":882.1,"unit":"m3","quality_flag":"ok"}]}'
```

## Core docs

- [Architecture](docs/architecture.md)
- [API](docs/api.md)
- [Data model](docs/data-model.md)
- [Roadmap](docs/roadmap.md)

## Companion gateway

The Raspberry Pi gateway companion service lives in:

- `gateway/README.md`
