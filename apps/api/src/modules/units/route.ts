import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@meteria/db";
import { writeAuditLog } from "../../lib/audit";

const createUnitSchema = z.object({
  building_id: z.string().uuid(),
  name: z.string().min(2),
  unit_number: z.string().min(1),
  floor: z.string().optional(),
  area_sqm: z.coerce.number().positive().optional(),
  usage_type: z.string().min(2)
});

const unitsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/units", { preHandler: [fastify.authenticateUser] }, async (request, reply) => {
    const query = z.object({ building_id: z.string().uuid().optional() }).safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: "Invalid query" });
    }

    const tenantId = request.user!.tenantId;

    const units = await prisma.unit.findMany({
      where: {
        building: {
          tenantId,
          id: query.data.building_id
        }
      },
      include: {
        building: true
      },
      orderBy: { createdAt: "desc" }
    });

    return { data: units };
  });

  fastify.post(
    "/api/v1/units",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin", "manager"])] },
    async (request, reply) => {
      const parsed = createUnitSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid unit payload", details: parsed.error.flatten() });
      }

      const payload = parsed.data;
      const tenantId = request.user!.tenantId;

      const building = await prisma.building.findFirst({
        where: {
          id: payload.building_id,
          tenantId
        }
      });

      if (!building) {
        return reply.code(404).send({ error: "Building not found" });
      }

      const unit = await prisma.unit.create({
        data: {
          buildingId: payload.building_id,
          name: payload.name,
          unitNumber: payload.unit_number,
          floor: payload.floor,
          areaSqm: payload.area_sqm,
          usageType: payload.usage_type
        }
      });

      await writeAuditLog({
        tenantId,
        userId: request.user!.userId,
        action: "unit.created",
        entityType: "unit",
        entityId: unit.id,
        payload
      });

      return reply.code(201).send({ data: unit });
    }
  );
};

export default unitsRoutes;
