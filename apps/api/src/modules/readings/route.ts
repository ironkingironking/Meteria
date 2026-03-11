import { FastifyPluginAsync } from "fastify";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { prisma } from "@meteria/db";
import { writeAuditLog, writeBillingChangeLog } from "../../lib/audit";

const manualReadingSchema = z.object({
  meter_id: z.string().uuid(),
  timestamp: z.coerce.date(),
  value: z.coerce.number(),
  raw_value: z.string().optional(),
  unit: z.string().min(1),
  quality_flag: z.enum(["ok", "estimated", "suspect", "missing"]).default("ok"),
  estimation_method: z.string().optional(),
  billing_note: z.string().optional()
});

const csvImportSchema = z.object({
  csv_content: z.string().min(1),
  source: z.enum(["import", "manual"]).default("import")
});

const readingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/v1/readings/manual",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin", "manager"])] },
    async (request, reply) => {
      const parsed = manualReadingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid manual reading payload", details: parsed.error.flatten() });
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
          rawValue: payload.raw_value,
          unit: payload.unit,
          qualityFlag: payload.quality_flag,
          source: "manual",
          lifecycleStatus: payload.quality_flag === "estimated" ? "estimated" : "original",
          estimationMethod: payload.estimation_method,
          billingNote: payload.billing_note
        } as any
      });

      await writeAuditLog({
        tenantId,
        userId: request.user!.userId,
        action: "reading.manual.created",
        entityType: "meter_reading",
        entityId: reading.id,
        payload
      });

      await writeBillingChangeLog({
        tenantId,
        userId: request.user!.userId,
        sourceModule: "manual_reading",
        action: "reading.manual.created",
        entityType: "meter_reading",
        entityId: reading.id,
        reason: payload.quality_flag === "estimated" ? "Estimated manual reading" : "Manual reading",
        changeSet: payload
      });

      return reply.code(201).send({ data: reading });
    }
  );

  fastify.post(
    "/api/v1/readings/import-csv",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin", "manager"])] },
    async (request, reply) => {
      const parsed = csvImportSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid CSV import payload", details: parsed.error.flatten() });
      }

      const tenantId = request.user!.tenantId;
      const records = parse(parsed.data.csv_content, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      }) as Array<Record<string, string>>;

      if (records.length === 0) {
        return reply.code(400).send({ error: "CSV payload is empty" });
      }

      const externalIds = Array.from(new Set(records.map((record) => record.meter_external_id)));
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
        timestamp: Date;
        value: number;
        rawValue?: string;
        unit: string;
        qualityFlag: "ok" | "estimated" | "suspect" | "missing";
        lifecycleStatus: "original" | "estimated";
        estimationMethod?: string;
        billingNote?: string;
        source: "import" | "manual";
      }> = [];

      const errors: Array<{ row: number; message: string; meter_external_id?: string }> = [];

      records.forEach((record, index) => {
        const meter = meterByExternalId.get(record.meter_external_id);
        if (!meter) {
          errors.push({
            row: index + 2,
            meter_external_id: record.meter_external_id,
            message: "Unknown meter_external_id"
          });
          return;
        }

        const parsedTimestamp = new Date(record.timestamp);
        const parsedValue = Number(record.value);

        if (!Number.isFinite(parsedValue) || Number.isNaN(parsedTimestamp.getTime())) {
          errors.push({
            row: index + 2,
            meter_external_id: record.meter_external_id,
            message: "Invalid timestamp or value"
          });
          return;
        }

        const qualityFlag =
          record.quality_flag === "estimated" ||
          record.quality_flag === "suspect" ||
          record.quality_flag === "missing"
            ? record.quality_flag
            : "ok";

        createData.push({
          tenantId,
          meterId: meter.id,
          timestamp: parsedTimestamp,
          value: parsedValue,
          rawValue: record.raw_value,
          unit: record.unit || meter.unit,
          qualityFlag,
          lifecycleStatus: qualityFlag === "estimated" ? "estimated" : "original",
          estimationMethod: record.estimation_method,
          billingNote: record.billing_note,
          source: parsed.data.source
        });
      });

      const result = await prisma.meterReading.createMany({
        data: createData as any,
        skipDuplicates: true
      });

      await writeAuditLog({
        tenantId,
        userId: request.user!.userId,
        action: "reading.csv.imported",
        entityType: "meter_reading",
        entityId: `tenant:${tenantId}`,
        payload: {
          rows: records.length,
          inserted: result.count,
          rejected: errors.length
        }
      });

      await writeBillingChangeLog({
        tenantId,
        userId: request.user!.userId,
        sourceModule: "csv_import",
        action: "reading.csv.imported",
        entityType: "meter_reading",
        entityId: `tenant:${tenantId}`,
        reason: "Bulk historical reading import",
        changeSet: {
          attempted: records.length,
          inserted: result.count,
          rejected: errors.length
        }
      });

      return reply.send({
        status: errors.length > 0 ? "partial_success" : "success",
        attempted: records.length,
        accepted: result.count,
        rejected: errors.length,
        errors
      });
    }
  );

  fastify.get("/api/v1/readings", { preHandler: [fastify.authenticateUser] }, async (request, reply) => {
    const query = z
      .object({
        meter_id: z.string().uuid(),
        from: z.coerce.date(),
        to: z.coerce.date(),
        limit: z.coerce.number().min(1).max(5000).default(500)
      })
      .safeParse(request.query);

    if (!query.success) {
      return reply.code(400).send({ error: "Invalid readings query", details: query.error.flatten() });
    }

    const meter = await prisma.meter.findFirst({
      where: {
        id: query.data.meter_id,
        tenantId: request.user!.tenantId
      }
    });

    if (!meter) {
      return reply.code(404).send({ error: "Meter not found" });
    }

    const readings = await prisma.meterReading.findMany({
      where: {
        tenantId: request.user!.tenantId,
        meterId: query.data.meter_id,
        timestamp: {
          gte: query.data.from,
          lte: query.data.to
        }
      },
      orderBy: { timestamp: "asc" },
      take: query.data.limit
    });

    return reply.send({ data: readings });
  });
};

export default readingsRoutes;
