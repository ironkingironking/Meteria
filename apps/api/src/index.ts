import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import { env } from "./lib/env";
import authPlugin from "./plugins/auth";
import authRoutes from "./modules/auth/route";
import buildingRoutes from "./modules/buildings/route";
import unitsRoutes from "./modules/units/route";
import meterRoutes from "./modules/meters/route";
import gatewaysRoutes from "./modules/gateways/route";
import ingestionRoutes from "./modules/ingestion/route";
import readingsRoutes from "./modules/readings/route";
import dashboardRoutes from "./modules/dashboard/route";
import tariffRoutes from "./modules/tariffs/route";
import billingPeriodRoutes from "./modules/billing-periods/route";
import billingRoutes from "./modules/billing/route";
import invoiceDraftRoutes from "./modules/invoice-drafts/route";
import auditRoutes from "./modules/audit/route";
import adminRoutes from "./modules/admin/route";
import exportsRoutes from "./modules/exports/route";
import taxProfilesRoutes from "./modules/tax-profiles/route";
import allocationKeyRoutes from "./modules/allocation-keys/route";
import operatingCostComponentRoutes from "./modules/operating-cost-components/route";
import meterReplacementEventsRoutes from "./modules/meter-replacement-events/route";
import readingCorrectionsRoutes from "./modules/reading-corrections/route";
import billingChangeLogRoutes from "./modules/billing-change-log/route";

const buildServer = async () => {
  const fastify = Fastify({
    logger: {
      level: env.LOG_LEVEL
    }
  });

  await fastify.register(sensible);
  await fastify.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true
  });

  await fastify.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute"
  });

  await fastify.register(authPlugin);

  fastify.get("/health", async () => ({ status: "ok", service: "meteria-api" }));

  await fastify.register(authRoutes);
  await fastify.register(buildingRoutes);
  await fastify.register(unitsRoutes);
  await fastify.register(meterRoutes);
  await fastify.register(gatewaysRoutes);
  await fastify.register(ingestionRoutes);
  await fastify.register(readingsRoutes);
  await fastify.register(dashboardRoutes);
  await fastify.register(tariffRoutes);
  await fastify.register(billingPeriodRoutes);
  await fastify.register(billingRoutes);
  await fastify.register(invoiceDraftRoutes);
  await fastify.register(taxProfilesRoutes);
  await fastify.register(allocationKeyRoutes);
  await fastify.register(operatingCostComponentRoutes);
  await fastify.register(meterReplacementEventsRoutes);
  await fastify.register(readingCorrectionsRoutes);
  await fastify.register(billingChangeLogRoutes);
  await fastify.register(auditRoutes);
  await fastify.register(adminRoutes);
  await fastify.register(exportsRoutes);

  fastify.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request failed");

    if ((error as { code?: string }).code === "P2002") {
      return reply.code(409).send({ error: "Unique constraint violation" });
    }

    return reply.code(500).send({ error: "Internal server error" });
  });

  return fastify;
};

const start = async (): Promise<void> => {
  const server = await buildServer();

  try {
    await server.listen({
      host: "0.0.0.0",
      port: env.API_PORT
    });
  } catch (error) {
    server.log.error(error, "failed to start server");
    process.exit(1);
  }
};

start();
