import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@meteria/db";
import { writeAuditLog } from "../../lib/audit";

const meterType = z.enum(["electricity", "water_cold", "water_hot", "heat", "gas"]);
const meterDirection = z.enum(["consumption", "production", "bidirectional"]);
const readingMode = z.enum(["cumulative", "interval"]);

const createMeterSchema = z.object({
  building_id: z.string().uuid(),
  unit_id: z.string().uuid().nullable().optional(),
  meter_number: z.string().min(2),
  external_id: z.string().min(2),
  name: z.string().min(2),
  type: meterType,
  medium: z.string().min(2),
  unit: z.string().min(1),
  direction: meterDirection.default("consumption"),
  reading_mode: readingMode,
  multiplier: z.coerce.number().positive().default(1),
  installed_at: z.coerce.date()
});

const meterRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/meters", { preHandler: [fastify.authenticateUser] }, async (request, reply) => {
    const query = z
      .object({
        building_id: z.string().uuid().optional(),
        unit_id: z.string().uuid().optional(),
        type: meterType.optional()
      })
      .safeParse(request.query);

    if (!query.success) {
      return reply.code(400).send({ error: "Invalid query" });
    }

    const meters = await prisma.meter.findMany({
      where: {
        tenantId: request.user!.tenantId,
        buildingId: query.data.building_id,
        unitId: query.data.unit_id,
        type: query.data.type
      },
      include: {
        building: true,
        assignedUnit: true
      },
      orderBy: { createdAt: "desc" }
    });

    return { data: meters };
  });

  fastify.post(
    "/api/v1/meters",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin", "manager"])] },
    async (request, reply) => {
      const parsed = createMeterSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid meter payload", details: parsed.error.flatten() });
      }

      const tenantId = request.user!.tenantId;
      const payload = parsed.data;

      const building = await prisma.building.findFirst({
        where: {
          id: payload.building_id,
          tenantId
        }
      });

      if (!building) {
        return reply.code(404).send({ error: "Building not found" });
      }

      if (payload.unit_id) {
        const unit = await prisma.unit.findFirst({
          where: {
            id: payload.unit_id,
            buildingId: payload.building_id
          }
        });
        if (!unit) {
          return reply.code(404).send({ error: "Unit not found" });
        }
      }

      const meter = await prisma.meter.create({
        data: {
          tenantId,
          buildingId: payload.building_id,
          unitId: payload.unit_id ?? null,
          meterNumber: payload.meter_number,
          externalId: payload.external_id,
          name: payload.name,
          type: payload.type,
          medium: payload.medium,
          unit: payload.unit,
          direction: payload.direction,
          readingMode: payload.reading_mode,
          multiplier: payload.multiplier,
          installedAt: payload.installed_at
        }
      });

      await writeAuditLog({
        tenantId,
        userId: request.user!.userId,
        action: "meter.created",
        entityType: "meter",
        entityId: meter.id,
        payload
      });

      return reply.code(201).send({ data: meter });
    }
  );

  fastify.get("/api/v1/meters/:id", { preHandler: [fastify.authenticateUser] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid meter id" });
    }

    const meter = await prisma.meter.findFirst({
      where: {
        id: params.data.id,
        tenantId: request.user!.tenantId
      },
      include: {
        building: true,
        assignedUnit: true,
        readings: {
          orderBy: { timestamp: "desc" },
          take: 50
        }
      }
    });

    if (!meter) {
      return reply.code(404).send({ error: "Meter not found" });
    }

    return reply.send({ data: meter });
  });
};

export default meterRoutes;
