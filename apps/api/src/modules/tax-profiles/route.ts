import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@meteria/db";
import { writeAuditLog, writeBillingChangeLog } from "../../lib/audit";

const createTaxProfileSchema = z.object({
  name: z.string().min(2),
  country_code: z.string().length(2).default("CH"),
  tax_handling_mode: z.enum(["exclusive", "inclusive", "exempt", "reverse_charge"]).default("exclusive"),
  vat_rate: z.coerce.number().min(0).max(1).nullable().optional(),
  valid_from: z.coerce.date(),
  valid_to: z.coerce.date().nullable().optional(),
  is_default: z.boolean().default(false)
});

const taxProfilesRoutes: FastifyPluginAsync = async (fastify) => {
  const db = prisma as any;

  fastify.get("/api/v1/tax-profiles", { preHandler: [fastify.authenticateUser] }, async (request) => {
    const profiles = await db.taxProfile.findMany({
      where: { tenantId: request.user!.tenantId },
      orderBy: { validFrom: "desc" }
    });

    return { data: profiles };
  });

  fastify.post(
    "/api/v1/tax-profiles",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin", "manager"])] },
    async (request, reply) => {
      const parsed = createTaxProfileSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid tax profile payload", details: parsed.error.flatten() });
      }

      const tenantId = request.user!.tenantId;
      const payload = parsed.data;

      if (payload.valid_to && payload.valid_to <= payload.valid_from) {
        return reply.code(400).send({ error: "valid_to must be after valid_from" });
      }

      const profile = await prisma.$transaction(async (tx) => {
        if (payload.is_default) {
          await (tx as any).taxProfile.updateMany({
            where: { tenantId },
            data: { isDefault: false }
          });
        }

        return (tx as any).taxProfile.create({
          data: {
            tenantId,
            name: payload.name,
            countryCode: payload.country_code.toUpperCase(),
            taxHandlingMode: payload.tax_handling_mode,
            vatRate: payload.vat_rate ?? null,
            validFrom: payload.valid_from,
            validTo: payload.valid_to ?? null,
            isDefault: payload.is_default
          }
        });
      });

      await writeAuditLog({
        tenantId,
        userId: request.user!.userId,
        action: "tax_profile.created",
        entityType: "tax_profile",
        entityId: profile.id,
        payload
      });

      await writeBillingChangeLog({
        tenantId,
        userId: request.user!.userId,
        sourceModule: "billing_tax",
        action: "tax_profile.created",
        entityType: "tax_profile",
        entityId: profile.id,
        reason: "Tax handling baseline updated",
        changeSet: payload
      });

      return reply.code(201).send({ data: profile });
    }
  );
};

export default taxProfilesRoutes;
