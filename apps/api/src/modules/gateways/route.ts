import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@meteria/db";
import { generateOpaqueToken } from "../../lib/security";
import { writeAuditLog } from "../../lib/audit";

const createGatewaySchema = z.object({
  building_id: z.string().uuid().nullable().optional(),
  name: z.string().min(2),
  serial_number: z.string().min(3),
  firmware_version: z.string().optional()
});

const gatewaysRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/gateways", { preHandler: [fastify.authenticateUser] }, async (request) => {
    const gateways = await prisma.gateway.findMany({
      where: {
        tenantId: request.user!.tenantId
      },
      include: {
        building: true
      },
      orderBy: { createdAt: "desc" }
    });

    const now = Date.now();
    const data = gateways.map((gateway) => {
      const online = gateway.lastSeenAt ? now - gateway.lastSeenAt.getTime() <= 5 * 60 * 1000 : false;
      return {
        ...gateway,
        computed_status: online ? "online" : "offline"
      };
    });

    return { data };
  });

  fastify.post(
    "/api/v1/gateways",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin", "manager"])] },
    async (request, reply) => {
      const parsed = createGatewaySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid gateway payload", details: parsed.error.flatten() });
      }

      const payload = parsed.data;
      const tenantId = request.user!.tenantId;

      if (payload.building_id) {
        const building = await prisma.building.findFirst({
          where: {
            id: payload.building_id,
            tenantId
          }
        });

        if (!building) {
          return reply.code(404).send({ error: "Building not found" });
        }
      }

      const token = generateOpaqueToken("gtw");

      const gateway = await prisma.gateway.create({
        data: {
          tenantId,
          buildingId: payload.building_id ?? null,
          name: payload.name,
          serialNumber: payload.serial_number,
          authTokenHash: token.hash,
          firmwareVersion: payload.firmware_version,
          status: "offline"
        }
      });

      await writeAuditLog({
        tenantId,
        userId: request.user!.userId,
        action: "gateway.created",
        entityType: "gateway",
        entityId: gateway.id,
        payload: {
          ...payload,
          token_issued: true
        }
      });

      return reply.code(201).send({
        data: gateway,
        auth_token: token.plain,
        warning: "Store this gateway token securely. It will not be shown again."
      });
    }
  );
};

export default gatewaysRoutes;
