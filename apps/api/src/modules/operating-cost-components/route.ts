import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@meteria/db";
import { writeAuditLog, writeBillingChangeLog } from "../../lib/audit";

const createComponentSchema = z.object({
  building_id: z.string().uuid().nullable().optional(),
  name: z.string().min(2),
  code: z.string().optional(),
  component_type: z.enum(["fixed", "variable"]),
  meter_type: z.enum(["electricity", "water_cold", "water_hot", "heat", "gas"]).nullable().optional(),
  fixed_amount: z.coerce.number().nullable().optional(),
  variable_rate: z.coerce.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  currency: z.string().length(3).default("CHF"),
  allocation_key_id: z.string().uuid().nullable().optional(),
  tax_profile_id: z.string().uuid().nullable().optional(),
  valid_from: z.coerce.date(),
  valid_to: z.coerce.date().nullable().optional(),
  is_active: z.boolean().default(true),
  formula_template: z.string().optional()
});

const operatingCostComponentRoutes: FastifyPluginAsync = async (fastify) => {
  const db = prisma as any;

  fastify.get(
    "/api/v1/operating-cost-components",
    { preHandler: [fastify.authenticateUser] },
    async (request, reply) => {
      const query = z.object({ building_id: z.string().uuid().optional() }).safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send({ error: "Invalid query" });
      }

      const components = await db.operatingCostComponent.findMany({
        where: {
          tenantId: request.user!.tenantId,
          buildingId: query.data.building_id
        },
        include: {
          allocationKey: true,
          taxProfile: true,
          building: true
        },
        orderBy: [{ isActive: "desc" }, { validFrom: "desc" }]
      });

      return { data: components };
    }
  );

  fastify.post(
    "/api/v1/operating-cost-components",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin", "manager"])] },
    async (request, reply) => {
      const parsed = createComponentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid operating cost component payload", details: parsed.error.flatten() });
      }

      const payload = parsed.data;
      const tenantId = request.user!.tenantId;

      if (payload.valid_to && payload.valid_to <= payload.valid_from) {
        return reply.code(400).send({ error: "valid_to must be after valid_from" });
      }

      if (payload.component_type === "fixed" && payload.fixed_amount === undefined) {
        return reply.code(400).send({ error: "fixed_amount is required for fixed components" });
      }

      if (payload.component_type === "variable" && payload.variable_rate === undefined) {
        return reply.code(400).send({ error: "variable_rate is required for variable components" });
      }

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

      if (payload.allocation_key_id) {
        const key = await db.tenantAllocationKey.findFirst({
          where: {
            id: payload.allocation_key_id,
            tenantId
          }
        });

        if (!key) {
          return reply.code(404).send({ error: "Allocation key not found" });
        }
      }

      if (payload.tax_profile_id) {
        const profile = await db.taxProfile.findFirst({
          where: {
            id: payload.tax_profile_id,
            tenantId
          }
        });

        if (!profile) {
          return reply.code(404).send({ error: "Tax profile not found" });
        }
      }

      const component = await db.operatingCostComponent.create({
        data: {
          tenantId,
          buildingId: payload.building_id ?? null,
          name: payload.name,
          code: payload.code,
          componentType: payload.component_type,
          meterType: payload.meter_type ?? null,
          fixedAmount: payload.fixed_amount ?? null,
          variableRate: payload.variable_rate ?? null,
          unit: payload.unit ?? null,
          currency: payload.currency.toUpperCase(),
          allocationKeyId: payload.allocation_key_id ?? null,
          taxProfileId: payload.tax_profile_id ?? null,
          validFrom: payload.valid_from,
          validTo: payload.valid_to ?? null,
          isActive: payload.is_active,
          formulaTemplate: payload.formula_template
        }
      });

      await writeAuditLog({
        tenantId,
        userId: request.user!.userId,
        action: "operating_cost_component.created",
        entityType: "operating_cost_component",
        entityId: component.id,
        payload
      });

      await writeBillingChangeLog({
        tenantId,
        userId: request.user!.userId,
        sourceModule: "billing_operating_costs",
        action: "operating_cost_component.created",
        entityType: "operating_cost_component",
        entityId: component.id,
        reason: "Operating cost component set changed",
        changeSet: payload
      });

      return reply.code(201).send({ data: component });
    }
  );
};

export default operatingCostComponentRoutes;
