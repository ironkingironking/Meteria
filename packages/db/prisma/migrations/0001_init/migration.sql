-- NOTE:
-- This repository uses `prisma db push` for MVP schema deployment.
-- The SQL below is kept as operational reference for production hardening.

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Convert meter_readings to a hypertable after Prisma applies schema.
SELECT create_hypertable('meter_readings', by_range('timestamp'), if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_meter_readings_tenant_meter_time
ON meter_readings (tenant_id, meter_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_meter_readings_tenant_source_time
ON meter_readings (tenant_id, source, timestamp DESC);
