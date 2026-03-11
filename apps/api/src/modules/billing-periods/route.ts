import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@meteria/db";
import { writeAuditLog, writeBillingChangeLog } from "../../lib/audit";

const createBillingPeriodSchema = z.object({
  building_id: z.string().uuid(),
  name: z.string().min(2),
  period_start: z.coerce.date(),
  period_end: z.coerce.date(),
  period_type: z.enum(["monthly", "quarterly", "annual", "custom"]).default("custom"),
  fiscal_year: z.coerce.number().int().min(2000).max(2200).optional(),
  status: z.enum(["draft", "locked", "finalized"]).default("draft")
});

const billingPeriodRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/billing-periods", { preHandler: [fastify.authenticateUser] }, async (request) => {
    const periods = await prisma.billingPeriod.findMany({
      where: {
        tenantId: request.user!.tenantId
      },
      include: {
        building: true
      },
      orderBy: { periodStart: "desc" }
    });

    return { data: periods };
  });

  fastify.post(
    "/api/v1/billing-periods",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin", "manager"])] },
    async (request, reply) => {
      const parsed = createBillingPeriodSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid billing period payload", details: parsed.error.flatten() });
      }

      const payload = parsed.data;
      const building = await prisma.building.findFirst({
        where: {
          id: payload.building_id,
          tenantId: request.user!.tenantId
        }
      });

      if (!building) {
        return reply.code(404).send({ error: "Building not found" });
      }

      if (payload.period_end <= payload.period_start) {
        return reply.code(400).send({ error: "period_end must be after period_start" });
      }

      if (payload.period_type === "annual") {
        const durationMs = payload.period_end.getTime() - payload.period_start.getTime();
        const minAnnual = 364 * 24 * 60 * 60 * 1000;
        const maxAnnual = 366 * 24 * 60 * 60 * 1000;
        if (durationMs < minAnnual || durationMs > maxAnnual) {
          return reply.code(400).send({ error: "Annual billing periods must cover roughly one year" });
        }
      }

      const period = await prisma.billingPeriod.create({
        data: {
          tenantId: request.user!.tenantId,
          buildingId: payload.building_id,
          name: payload.name,
          periodStart: payload.period_start,
          periodEnd: payload.period_end,
          periodType: payload.period_type,
          fiscalYear: payload.fiscal_year ?? payload.period_start.getUTCFullYear(),
          status: payload.status
        } as any
      });

      await writeAuditLog({
        tenantId: request.user!.tenantId,
        userId: request.user!.userId,
        action: "billing_period.created",
        entityType: "billing_period",
        entityId: period.id,
        payload
      });

      await writeBillingChangeLog({
        tenantId: request.user!.tenantId,
        userId: request.user!.userId,
        sourceModule: "billing_period",
        action: "billing_period.created",
        entityType: "billing_period",
        entityId: period.id,
        reason: payload.period_type === "annual" ? "Annual period introduced" : "Billing period created",
        changeSet: payload
      });

      return reply.code(201).send({ data: period });
    }
  );
};

export default billingPeriodRoutes;
