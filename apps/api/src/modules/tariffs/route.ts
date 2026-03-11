import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@meteria/db";
import { writeAuditLog, writeBillingChangeLog } from "../../lib/audit";

const createTariffSchema = z.object({
  name: z.string().min(2),
  meter_type: z.enum(["electricity", "water_cold", "water_hot", "heat", "gas"]),
  valid_from: z.coerce.date(),
  valid_to: z.coerce.date().nullable().optional(),
  pricing_model: z.enum(["flat_per_unit", "tiered", "monthly_fixed_plus_usage"]),
  price_per_unit: z.coerce.number().nullable().optional(),
  monthly_base_fee: z.coerce.number().nullable().optional(),
  currency: z.string().length(3).default("CHF"),
  tax_profile_id: z.string().uuid().nullable().optional()
});

const tariffRoutes: FastifyPluginAsync = async (fastify) => {
  const db = prisma as any;

  fastify.get("/api/v1/tariffs", { preHandler: [fastify.authenticateUser] }, async (request) => {
    const tariffs = await prisma.tariff.findMany({
      where: {
        tenantId: request.user!.tenantId
      },
      orderBy: { createdAt: "desc" }
    });

    return { data: tariffs };
  });

  fastify.post(
    "/api/v1/tariffs",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin", "manager"])] },
    async (request, reply) => {
      const parsed = createTariffSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid tariff payload", details: parsed.error.flatten() });
      }

      const payload = parsed.data;
      if (payload.tax_profile_id) {
        const profile = await db.taxProfile.findFirst({
          where: {
            id: payload.tax_profile_id,
            tenantId: request.user!.tenantId
          }
        });
        if (!profile) {
          return reply.code(404).send({ error: "Tax profile not found" });
        }
      }

      const tariff = await prisma.tariff.create({
        data: {
          tenantId: request.user!.tenantId,
          name: payload.name,
          meterType: payload.meter_type,
          validFrom: payload.valid_from,
          validTo: payload.valid_to ?? null,
          pricingModel: payload.pricing_model,
          pricePerUnit: payload.price_per_unit,
          monthlyBaseFee: payload.monthly_base_fee,
          currency: payload.currency.toUpperCase(),
          taxProfileId: payload.tax_profile_id ?? null
        } as any
      });

      await writeAuditLog({
        tenantId: request.user!.tenantId,
        userId: request.user!.userId,
        action: "tariff.created",
        entityType: "tariff",
        entityId: tariff.id,
        payload
      });

      await writeBillingChangeLog({
        tenantId: request.user!.tenantId,
        userId: request.user!.userId,
        sourceModule: "tariff",
        action: "tariff.created",
        entityType: "tariff",
        entityId: tariff.id,
        reason: "Tariff baseline changed",
        changeSet: payload
      });

      return reply.code(201).send({ data: tariff });
    }
  );
};

export default tariffRoutes;
