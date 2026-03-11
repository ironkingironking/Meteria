import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@meteria/db";
import { writeAuditLog } from "../../lib/audit";

const readingSchema = z.object({
  meter_external_id: z.string().min(1),
  timestamp: z.coerce.date(),
  value: z.coerce.number(),
  raw_value: z.string().optional(),
  unit: z.string().min(1),
  quality_flag: z.enum(["ok", "estimated", "suspect", "missing"]).default("ok")
});

const singlePayloadSchema = readingSchema;

const batchPayloadSchema = z.object({
  gateway_serial: z.string().min(3).optional(),
  readings: z.array(readingSchema).min(1)
});

const ingestionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/v1/ingestion/readings",
    { preHandler: [fastify.authenticateIngestion] },
    async (request, reply) => {
      if (!request.ingestionAuth) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      const tenantId = request.ingestionAuth.tenantId;
      const singleParse = singlePayloadSchema.safeParse(request.body);
      const batchParse = batchPayloadSchema.safeParse(request.body);

      let normalizedReadings: Array<z.infer<typeof readingSchema>> = [];
      let gatewaySerial: string | undefined;

      if (batchParse.success) {
        normalizedReadings = batchParse.data.readings;
        gatewaySerial = batchParse.data.gateway_serial;
      } else if (singleParse.success) {
        normalizedReadings = [singleParse.data];
      } else {
        return reply.code(400).send({
          error: "Invalid ingestion payload",
          details: {
            single: singleParse.error.flatten(),
            batch: batchParse.error.flatten()
          }
        });
      }

      let gatewayId = request.ingestionAuth.gatewayId;

      if (!gatewayId && gatewaySerial) {
        const gateway = await prisma.gateway.findFirst({
          where: {
            tenantId,
            serialNumber: gatewaySerial
          }
        });

        if (!gateway) {
          return reply.code(404).send({ error: `Unknown gateway serial: ${gatewaySerial}` });
        }

        gatewayId = gateway.id;
      }

      const externalIds = Array.from(new Set(normalizedReadings.map((entry) => entry.meter_external_id)));
      const meters = await prisma.meter.findMany({
        where: {
          tenantId,
          externalId: { in: externalIds }
        }
      });

      const meterByExternalId = new Map(meters.map((meter) => [meter.externalId, meter]));

      const createData: Array<{
        tenantId: string;
        meterId: string;
        gatewayId: string | null;
        timestamp: Date;
        value: number;
        rawValue?: string;
        unit: string;
        qualityFlag: "ok" | "estimated" | "suspect" | "missing";
        lifecycleStatus: "original" | "estimated";
        source: "gateway" | "api";
      }> = [];

      const errors: Array<{ index: number; meter_external_id: string; message: string }> = [];

      normalizedReadings.forEach((entry, index) => {
        const meter = meterByExternalId.get(entry.meter_external_id);

        if (!meter) {
          errors.push({
            index,
            meter_external_id: entry.meter_external_id,
            message: "Unknown meter_external_id for this tenant"
          });
          return;
        }

        createData.push({
          tenantId,
          meterId: meter.id,
          gatewayId,
          timestamp: entry.timestamp,
          value: entry.value,
          rawValue: entry.raw_value,
          unit: entry.unit,
          qualityFlag: entry.quality_flag,
          lifecycleStatus: entry.quality_flag === "estimated" ? "estimated" : "original",
          source: gatewayId ? "gateway" : "api"
        });
      });

      let insertedCount = 0;
      if (createData.length > 0) {
        const result = await prisma.meterReading.createMany({
          data: createData,
          skipDuplicates: true
        });
        insertedCount = result.count;
      }

      const rejected = errors.length;
      const attempted = normalizedReadings.length;
      const idempotentCount = Math.max(0, attempted - rejected - insertedCount);

      if (gatewayId) {
        await prisma.gateway.update({
          where: { id: gatewayId },
          data: {
            lastSeenAt: new Date(),
            status: "online"
          }
        });
      }

      await writeAuditLog({
        tenantId,
        userId: null,
        action: "ingestion.readings.accepted",
        entityType: "meter_reading",
        entityId: gatewayId ?? `tenant:${tenantId}`,
        payload: {
          attempted,
          inserted: insertedCount,
          rejected,
          idempotent: idempotentCount,
          gatewayId,
          apiKeyId: request.ingestionAuth.apiKeyId
        }
      });

      fastify.log.info(
        {
          tenantId,
          gatewayId,
          insertedCount,
          rejected,
          idempotentCount
        },
        "ingestion processed"
      );

      return reply.send({
        status: errors.length > 0 ? "partial_success" : "success",
        attempted,
        accepted: insertedCount,
        rejected,
        idempotent: idempotentCount,
        errors
      });
    }
  );
};

export default ingestionRoutes;
