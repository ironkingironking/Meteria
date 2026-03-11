import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@meteria/db";

const auditRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/api/v1/audit-log",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin", "manager"])] },
    async (request, reply) => {
      const query = z
        .object({
          limit: z.coerce.number().min(1).max(500).default(200),
          action: z.string().optional()
        })
        .safeParse(request.query);

      if (!query.success) {
        return reply.code(400).send({ error: "Invalid query" });
      }

      const logs = await prisma.auditLog.findMany({
        where: {
          tenantId: request.user!.tenantId,
          action: query.data.action
        },
        orderBy: { createdAt: "desc" },
        take: query.data.limit
      });

      return reply.send({ data: logs });
    }
  );
};

export default auditRoutes;
