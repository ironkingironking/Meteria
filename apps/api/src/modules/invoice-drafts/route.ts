import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@meteria/db";

const invoiceDraftRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/invoice-drafts", { preHandler: [fastify.authenticateUser] }, async (request, reply) => {
    const query = z
      .object({
        billing_period_id: z.string().uuid().optional(),
        building_id: z.string().uuid().optional()
      })
      .safeParse(request.query);

    if (!query.success) {
      return reply.code(400).send({ error: "Invalid query" });
    }

    const drafts = await prisma.invoiceDraft.findMany({
      where: {
        tenantId: request.user!.tenantId,
        billingPeriodId: query.data.billing_period_id,
        buildingId: query.data.building_id
      },
      include: {
        billingPeriod: true,
        building: true,
        unit: true
      },
      orderBy: { createdAt: "desc" }
    });

    return reply.send({ data: drafts });
  });

  fastify.get("/api/v1/invoice-drafts/:id", { preHandler: [fastify.authenticateUser] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid invoice draft id" });
    }

    const draft = await prisma.invoiceDraft.findFirst({
      where: {
        id: params.data.id,
        tenantId: request.user!.tenantId
      },
      include: {
        billingPeriod: true,
        building: true,
        unit: true
      }
    });

    if (!draft) {
      return reply.code(404).send({ error: "Invoice draft not found" });
    }

    return reply.send({ data: draft });
  });
};

export default invoiceDraftRoutes;
