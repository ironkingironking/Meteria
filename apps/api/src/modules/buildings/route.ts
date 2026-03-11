import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@meteria/db";
import { notFound } from "../../lib/http";
import { writeAuditLog } from "../../lib/audit";

const createBuildingSchema = z.object({
  name: z.string().min(2),
  external_reference: z.string().optional(),
  address_line_1: z.string().min(3),
  postal_code: z.string().min(2),
  city: z.string().min(2),
  country: z.string().min(2),
  timezone: z.string().default("Europe/Zurich")
});

const buildingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/buildings", { preHandler: [fastify.authenticateUser] }, async (request) => {
    const tenantId = request.user!.tenantId;
    const buildings = await prisma.building.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" }
    });

    return { data: buildings };
  });

  fastify.post(
    "/api/v1/buildings",
    {
      preHandler: [fastify.authenticateUser, fastify.requireRole(["admin", "manager"])]
    },
    async (request, reply) => {
      const parsed = createBuildingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid building payload", details: parsed.error.flatten() });
      }

      const tenantId = request.user!.tenantId;
      const payload = parsed.data;

      const building = await prisma.building.create({
        data: {
          tenantId,
          name: payload.name,
          externalReference: payload.external_reference,
          addressLine1: payload.address_line_1,
          postalCode: payload.postal_code,
          city: payload.city,
          country: payload.country,
          timezone: payload.timezone
        }
      });

      await writeAuditLog({
        tenantId,
        userId: request.user!.userId,
        action: "building.created",
        entityType: "building",
        entityId: building.id,
        payload
      });

      return reply.code(201).send({ data: building });
    }
  );

  fastify.get("/api/v1/buildings/:id", { preHandler: [fastify.authenticateUser] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid building id" });
    }

    const building = await prisma.building.findFirst({
      where: {
        id: params.data.id,
        tenantId: request.user!.tenantId
      },
      include: {
        units: true,
        meters: {
          orderBy: { createdAt: "desc" }
        },
        gateways: true
      }
    });

    if (!building) {
      return notFound(reply, "Building not found");
    }

    return reply.send({ data: building });
  });
};

export default buildingRoutes;
