import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@meteria/db";

const billingChangeLogRoutes: FastifyPluginAsync = async (fastify) => {
  const db = prisma as any;

  fastify.get(
    "/api/v1/billing-change-log",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin", "manager"])] },
    async (request, reply) => {
      const query = z
        .object({
          limit: z.coerce.number().min(1).max(500).default(200),
          entity_type: z.string().optional(),
          entity_id: z.string().optional(),
          source_module: z.string().optional()
        })
        .safeParse(request.query);

      if (!query.success) {
        return reply.code(400).send({ error: "Invalid query", details: query.error.flatten() });
      }

      const logs = await db.billingChangeLog.findMany({
        where: {
          tenantId: request.user!.tenantId,
          entityType: query.data.entity_type,
          entityId: query.data.entity_id,
          sourceModule: query.data.source_module
        },
        include: {
          user: {
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

      return reply.send({ data: logs });
    }
  );
};

export default billingChangeLogRoutes;
