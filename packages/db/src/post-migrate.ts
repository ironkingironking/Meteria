import { prisma } from "./client";

const statements = [
  `CREATE EXTENSION IF NOT EXISTS timescaledb`,
  `SELECT create_hypertable('meter_readings', by_range('timestamp'), if_not_exists => TRUE)`,
  `CREATE INDEX IF NOT EXISTS idx_meter_readings_tenant_meter_time ON meter_readings (tenant_id, meter_id, timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_meter_readings_tenant_source_time ON meter_readings (tenant_id, source, timestamp DESC)`
];

async function run(): Promise<void> {
  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }

  await prisma.$disconnect();
}

run().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error("post-migrate failed", error);
  await prisma.$disconnect();
  process.exit(1);
});
