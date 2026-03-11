import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@meteria/db";
import { writeAuditLog, writeBillingChangeLog } from "../../lib/audit";

const createEstimatedReadingSchema = z.object({
  meter_id: z.string().uuid(),
  timestamp: z.coerce.date(),
  value: z.coerce.number(),
  unit: z.string().min(1),
  estimation_method: z.string().min(2),
  billing_note: z.string().optional()
});

const createCorrectionSchema = z.object({
  corrected_value: z.coerce.number(),
  corrected_timestamp: z.coerce.date().optional(),
  quality_flag: z.enum(["ok", "estimated", "suspect", "missing"]).default("ok"),
  correction_type: z
    .enum(["manual_correction", "estimated_fill", "replacement_adjustment", "import_reconciliation"])
    .default("manual_correction"),
  reason: z.string().min(3),
  billing_note: z.string().optional()
});

const readingCorrectionsRoutes: FastifyPluginAsync = async (fastify) => {
  const db = prisma as any;

  fastify.get(
    "/api/v1/readings/corrections",
    { preHandler: [fastify.authenticateUser] },
    async (request, reply) => {
      const query = z.object({ meter_id: z.string().uuid().optional(), limit: z.coerce.number().max(500).default(100) }).safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send({ error: "Invalid query" });
      }

      const events = await db.readingCorrectionEvent.findMany({
        where: {
          tenantId: request.user!.tenantId,
          meterId: query.data.meter_id
        },
        include: {
          originalReading: true,
          correctedReading: true,
          createdBy: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        take: query.data.limit
      });

      return { data: events };
    }
  );

  fastify.post(
    "/api/v1/readings/estimated",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin", "manager"])] },
    async (request, reply) => {
      const parsed = createEstimatedReadingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid estimated reading payload", details: parsed.error.flatten() });
      }

      const payload = parsed.data;
      const tenantId = request.user!.tenantId;

      const meter = await prisma.meter.findFirst({
        where: {
          id: payload.meter_id,
          tenantId
        }
      });

      if (!meter) {
        return reply.code(404).send({ error: "Meter not found" });
      }

      const reading = await prisma.meterReading.create({
        data: {
          tenantId,
          meterId: meter.id,
          timestamp: payload.timestamp,
          value: payload.value,
          unit: payload.unit,
          qualityFlag: "estimated",
          source: "manual",
          lifecycleStatus: "estimated",
          estimationMethod: payload.estimation_method,
          billingNote: payload.billing_note
        } as any
      });

      await writeAuditLog({
        tenantId,
        userId: request.user!.userId,
        action: "reading.estimated.created",
        entityType: "meter_reading",
        entityId: reading.id,
        payload
      });

      await writeBillingChangeLog({
        tenantId,
        userId: request.user!.userId,
        sourceModule: "reading_estimation",
        action: "reading.estimated.created",
        entityType: "meter_reading",
        entityId: reading.id,
        reason: "Estimated reading inserted",
        changeSet: payload
      });

      return reply.code(201).send({ data: reading });
    }
  );

  fastify.post(
    "/api/v1/readings/:id/corrections",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin", "manager"])] },
    async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      const body = createCorrectionSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply
          .code(400)
          .send({ error: "Invalid correction request", details: { params: params.success ? undefined : params.error.flatten(), body: body.success ? undefined : body.error.flatten() } });
      }

      const tenantId = request.user!.tenantId;
      const payload = body.data;

      const original = await prisma.meterReading.findFirst({
        where: {
          id: params.data.id,
          tenantId
        }
      });

      if (!original) {
        return reply.code(404).send({ error: "Original reading not found" });
      }

      const corrected = await prisma.$transaction(async (tx) => {
        const created = await tx.meterReading.create({
          data: {
            tenantId,
            meterId: original.meterId,
            gatewayId: original.gatewayId,
            timestamp: payload.corrected_timestamp ?? original.timestamp,
            value: payload.corrected_value,
            rawValue: original.rawValue,
            unit: original.unit,
            qualityFlag: payload.quality_flag,
            source: "manual",
            lifecycleStatus: "corrected",
            supersedesReadingId: original.id,
            billingNote: payload.billing_note
          } as any
        });

        await tx.meterReading.update({
          where: { id: original.id },
          data: {
            lifecycleStatus: "superseded",
            billingNote: payload.reason
          } as any
        });

        await (tx as any).readingCorrectionEvent.create({
          data: {
            tenantId,
            meterId: original.meterId,
            originalReadingId: original.id,
            correctedReadingId: created.id,
            correctionType: payload.correction_type,
            reason: payload.reason,
            detailsJson: {
              quality_flag: payload.quality_flag,
              billing_note: payload.billing_note
            },
            createdByUserId: request.user!.userId
          }
        });

        return created;
      });

      await writeAuditLog({
        tenantId,
        userId: request.user!.userId,
        action: "reading.corrected",
        entityType: "meter_reading",
        entityId: corrected.id,
        payload: {
          original_reading_id: original.id,
          ...payload
        }
      });

      await writeBillingChangeLog({
        tenantId,
        userId: request.user!.userId,
        sourceModule: "reading_correction",
        action: "reading.corrected",
        entityType: "meter_reading",
        entityId: corrected.id,
        reason: payload.reason,
        changeSet: {
          originalReadingId: original.id,
          correctedReadingId: corrected.id,
          correctionType: payload.correction_type
        }
      });

      return reply.code(201).send({ data: corrected });
    }
  );
};

export default readingCorrectionsRoutes;
