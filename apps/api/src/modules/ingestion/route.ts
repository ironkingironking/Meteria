import { randomUUID } from "node:crypto";
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { Prisma, prisma } from "@meteria/db";
import { writeAuditLog } from "../../lib/audit";
import {
  MAX_INGESTION_BATCH_SIZE,
  parseIngestionPayload,
  type NormalizedReading,
  validateGatewaySerialMatch
} from "./processing";
import { buildRawEventReprocessingPort } from "./service-boundaries";

const INGESTION_INSERT_CHUNK_SIZE = 500;
const RAW_EVENT_INSERT_CHUNK_SIZE = 1000;
const MAX_INGESTION_AGE_DAYS = 365 * 5;
const MAX_INGESTION_FUTURE_MINUTES = 15;

const serializeReadingPayload = (entry: NormalizedReading): Prisma.InputJsonObject => ({
  meter_external_id: entry.meter_external_id,
  timestamp: entry.timestamp.toISOString(),
  value: entry.value,
  ...(entry.raw_value !== undefined ? { raw_value: entry.raw_value } : {}),
  unit: entry.unit,
  quality_flag: entry.quality_flag
});

const rawEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  processing_status: z.enum(["accepted", "rejected", "error", "reprocess_requested"]).optional(),
  source: z.enum(["api", "manual", "import", "gateway"]).optional(),
  gateway_id: z.string().uuid().optional(),
  meter_external_id: z.string().min(1).optional(),
  correlation_id: z.string().min(1).optional(),
  include_payload: z.coerce.boolean().optional().default(false)
});

const reprocessBodySchema = z
  .object({
    raw_event_ids: z.array(z.string().uuid()).min(1).optional(),
    correlation_id: z.string().min(1).optional(),
    reason: z.string().trim().min(3).max(500).optional()
  })
  .refine((value) => Boolean(value.raw_event_ids?.length || value.correlation_id), {
    message: "Provide raw_event_ids or correlation_id"
  });

const ingestionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/v1/ingestion/readings",
    { preHandler: [fastify.authenticateIngestion] },
    async (request, reply) => {
      if (!request.ingestionAuth) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      const parsedPayload = parseIngestionPayload(request.body, MAX_INGESTION_BATCH_SIZE);
      if (!parsedPayload.success) {
        return reply.code(400).send({
          error: parsedPayload.error.message,
          details: parsedPayload.error.details
        });
      }

      const correlationIdHeader = request.headers["x-correlation-id"];
      const correlationId =
        typeof correlationIdHeader === "string" && correlationIdHeader.trim().length > 0
          ? correlationIdHeader.trim()
          : randomUUID();

      const tenantId = request.ingestionAuth.tenantId;
      const attempted = parsedPayload.readings.length;
      const now = new Date();
      const minTimestamp = new Date(now.getTime() - MAX_INGESTION_AGE_DAYS * 24 * 60 * 60 * 1000);
      const maxTimestamp = new Date(now.getTime() + MAX_INGESTION_FUTURE_MINUTES * 60 * 1000);

      let gatewayId = request.ingestionAuth.gatewayId;
      let authenticatedGatewaySerial: string | undefined;

      if (gatewayId) {
        const authenticatedGateway = await prisma.gateway.findFirst({
          where: { id: gatewayId, tenantId }
        });

        if (!authenticatedGateway) {
          return reply.code(401).send({ error: "Invalid gateway context" });
        }
        authenticatedGatewaySerial = authenticatedGateway.serialNumber;
      }

      const gatewaySerialValidation = validateGatewaySerialMatch(
        authenticatedGatewaySerial,
        parsedPayload.gatewaySerial
      );
      if (!gatewaySerialValidation.valid) {
        return reply.code(400).send({ error: gatewaySerialValidation.message });
      }

      if (!gatewayId && parsedPayload.gatewaySerial) {
        const gateway = await prisma.gateway.findFirst({
          where: {
            tenantId,
            serialNumber: parsedPayload.gatewaySerial
          }
        });

        if (!gateway) {
          return reply.code(404).send({ error: `Unknown gateway serial: ${parsedPayload.gatewaySerial}` });
        }

        gatewayId = gateway.id;
      }

      const externalIds = Array.from(new Set(parsedPayload.readings.map((entry) => entry.meter_external_id)));
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

      const rawEventData: Array<{
        tenantId: string;
        gatewayId: string | null;
        apiKeyId: string | null;
        source: "gateway" | "api";
        meterExternalId: string | null;
        correlationId: string;
        payloadJson: Prisma.InputJsonValue;
        processingStatus: "accepted" | "rejected";
        errorJson?: Prisma.InputJsonValue;
      }> = [];

      const errors: Array<{ index: number; meter_external_id: string; message: string }> = [];

      parsedPayload.readings.forEach((entry, index) => {
        const meter = meterByExternalId.get(entry.meter_external_id);
        const readingTimestamp = entry.timestamp;

        let errorMessage: string | null = null;
        if (!meter) {
          errorMessage = "Unknown meter_external_id for this tenant";
        } else if (readingTimestamp < minTimestamp || readingTimestamp > maxTimestamp) {
          errorMessage = "timestamp outside accepted ingestion window";
        }

        if (errorMessage) {
          const payloadJson = serializeReadingPayload(entry);

          errors.push({
            index,
            meter_external_id: entry.meter_external_id,
            message: errorMessage
          });

          rawEventData.push({
            tenantId,
            gatewayId,
            apiKeyId: request.ingestionAuth!.apiKeyId,
            source: gatewayId ? "gateway" : "api",
            meterExternalId: entry.meter_external_id,
            correlationId,
            payloadJson,
            processingStatus: "rejected",
            errorJson: { message: errorMessage }
          });
          return;
        }

        createData.push({
          tenantId,
          meterId: meter!.id,
          gatewayId,
          timestamp: readingTimestamp,
          value: entry.value,
          rawValue: entry.raw_value,
          unit: entry.unit,
          qualityFlag: entry.quality_flag,
          lifecycleStatus: entry.quality_flag === "estimated" ? "estimated" : "original",
          source: gatewayId ? "gateway" : "api"
        });

        const payloadJson = serializeReadingPayload(entry);

        rawEventData.push({
          tenantId,
          gatewayId,
          apiKeyId: request.ingestionAuth!.apiKeyId,
          source: gatewayId ? "gateway" : "api",
          meterExternalId: entry.meter_external_id,
          correlationId,
          payloadJson,
          processingStatus: "accepted"
        });
      });

      let insertedCount = 0;
      for (let index = 0; index < createData.length; index += INGESTION_INSERT_CHUNK_SIZE) {
        const chunk = createData.slice(index, index + INGESTION_INSERT_CHUNK_SIZE);
        if (chunk.length === 0) {
          continue;
        }
        const result = await prisma.meterReading.createMany({
          data: chunk,
          skipDuplicates: true
        });
        insertedCount += result.count;
      }

      for (let index = 0; index < rawEventData.length; index += RAW_EVENT_INSERT_CHUNK_SIZE) {
        const chunk = rawEventData.slice(index, index + RAW_EVENT_INSERT_CHUNK_SIZE);
        if (chunk.length === 0) {
          continue;
        }
        await prisma.rawMeterEvent.createMany({ data: chunk });
      }

      const rejected = errors.length;
      const idempotentCount = Math.max(0, attempted - rejected - insertedCount);

      if (gatewayId) {
        await prisma.gateway.update({
          where: { id: gatewayId },
          data: {
            lastSeenAt: now,
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
          correlation_id: correlationId,
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
          idempotentCount,
          correlationId
        },
        "ingestion processed"
      );

      return reply.send({
        status: errors.length > 0 ? "partial_success" : "success",
        attempted,
        accepted: insertedCount,
        rejected,
        idempotent: idempotentCount,
        correlation_id: correlationId,
        errors
      });
    }
  );

  fastify.get(
    "/api/v1/ingestion/raw-events",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin", "manager"])] },
    async (request, reply) => {
      const parsed = rawEventsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid query", details: parsed.error.flatten() });
      }

      const query = parsed.data;
      const where: Record<string, unknown> = {
        tenantId: request.user!.tenantId
      };

      if (query.from || query.to) {
        where.receivedAt = {
          gte: query.from,
          lte: query.to
        };
      }
      if (query.processing_status) {
        where.processingStatus = query.processing_status;
      }
      if (query.source) {
        where.source = query.source;
      }
      if (query.gateway_id) {
        where.gatewayId = query.gateway_id;
      }
      if (query.meter_external_id) {
        where.meterExternalId = query.meter_external_id;
      }
      if (query.correlation_id) {
        where.correlationId = query.correlation_id;
      }

      const rawEvents = await prisma.rawMeterEvent.findMany({
        where,
        orderBy: { receivedAt: "desc" },
        take: query.limit
      });

      return {
        data: rawEvents.map((event) => ({
          id: event.id,
          tenant_id: event.tenantId,
          gateway_id: event.gatewayId,
          api_key_id: event.apiKeyId,
          source: event.source,
          meter_external_id: event.meterExternalId,
          correlation_id: event.correlationId,
          processing_status: event.processingStatus,
          error_json: event.errorJson,
          received_at: event.receivedAt,
          processed_at: event.processedAt,
          ...(query.include_payload ? { payload_json: event.payloadJson } : {})
        }))
      };
    }
  );

  fastify.post(
    "/api/v1/ingestion/raw-events/reprocess",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin", "manager"])] },
    async (request, reply) => {
      const parsed = reprocessBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }

      const tenantId = request.user!.tenantId;
      const where: Record<string, unknown> = { tenantId };
      if (parsed.data.raw_event_ids?.length) {
        where.id = { in: parsed.data.raw_event_ids };
      }
      if (parsed.data.correlation_id) {
        where.correlationId = parsed.data.correlation_id;
      }

      const events = await prisma.rawMeterEvent.findMany({
        where,
        select: { id: true }
      });

      if (events.length === 0) {
        return reply.code(404).send({ error: "No matching raw events found" });
      }

      const rawEventIds = events.map((event) => event.id);

      await prisma.rawMeterEvent.updateMany({
        where: { tenantId, id: { in: rawEventIds } },
        data: {
          processingStatus: "reprocess_requested"
        }
      });

      const reprocessingPort = buildRawEventReprocessingPort();
      const reprocessResult = await reprocessingPort.requestReprocess({
        tenantId,
        rawEventIds,
        requestedByUserId: request.user!.userId,
        reason: parsed.data.reason,
        correlationId: parsed.data.correlation_id
      });

      await writeAuditLog({
        tenantId,
        userId: request.user!.userId,
        action: "ingestion.raw_events.reprocess_requested",
        entityType: "raw_meter_event",
        entityId: parsed.data.correlation_id ?? `batch:${rawEventIds.length}`,
        payload: {
          raw_event_ids: rawEventIds,
          reason: parsed.data.reason,
          reprocess_result: reprocessResult
        }
      });

      return reply.code(202).send({
        status: "accepted",
        requested_count: rawEventIds.length,
        result: reprocessResult
      });
    }
  );
};

export default ingestionRoutes;
