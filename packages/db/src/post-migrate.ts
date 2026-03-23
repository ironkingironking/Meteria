import { prisma } from "./client";

type Statement = {
  sql: string;
  optional?: boolean;
};

const statements: Statement[] = [
  { sql: `CREATE EXTENSION IF NOT EXISTS timescaledb`, optional: true },
  {
    sql: `SELECT create_hypertable('meter_readings', by_range('timestamp'), if_not_exists => TRUE)`,
    optional: true
  },
  {
    sql: `CREATE INDEX IF NOT EXISTS idx_meter_readings_tenant_meter_time ON meter_readings (tenant_id, meter_id, timestamp DESC)`
  },
  {
    sql: `CREATE INDEX IF NOT EXISTS idx_meter_readings_tenant_source_time ON meter_readings (tenant_id, source, timestamp DESC)`
  }
];

function isSkippableTimescaleError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeMeta = (error as { meta?: { code?: string; message?: string } }).meta;
  const code = maybeMeta?.code ?? "";
  const message = maybeMeta?.message ?? "";

  return (
    code === "TS103" ||
    code === "0A000" ||
    message.includes("cannot create a unique index without the column \"timestamp\"")
    || message.includes("table \"meter_readings\" is not empty")
  );
}

async function run(): Promise<void> {
  for (const statement of statements) {
    try {
      await prisma.$executeRawUnsafe(statement.sql);
    } catch (error) {
      if (statement.optional && isSkippableTimescaleError(error)) {
        // eslint-disable-next-line no-console
        console.warn("post-migrate: skipping optional timescale optimization", error);
        continue;
      }

      throw error;
    }
  }

  await prisma.$disconnect();
}

run().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error("post-migrate failed", error);
  await prisma.$disconnect();
  process.exit(1);
});
