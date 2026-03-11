import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@meteria/db";
import { writeAuditLog, writeBillingChangeLog } from "../../lib/audit";

const entrySchema = z.object({
  unit_id: z.string().uuid().nullable().optional(),
  label: z.string().optional(),
  share_value: z.coerce.number().positive(),
  basis_value: z.coerce.number().positive().nullable().optional()
});

const createAllocationKeySchema = z.object({
  building_id: z.string().uuid().nullable().optional(),
  name: z.string().min(2),
  method: z.enum(["area_sqm", "unit_count", "occupancy", "custom_share", "meter_weighted"]),
  is_default: z.boolean().default(false),
  valid_from: z.coerce.date(),
  valid_to: z.coerce.date().nullable().optional(),
  notes: z.string().optional(),
  entries: z.array(entrySchema).default([])
});

const allocationKeyRoutes: FastifyPluginAsync = async (fastify) => {
  const db = prisma as any;

  fastify.get("/api/v1/allocation-keys", { preHandler: [fastify.authenticateUser] }, async (request, reply) => {
    const query = z.object({ building_id: z.string().uuid().optional() }).safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: "Invalid query" });
    }

    const keys = await db.tenantAllocationKey.findMany({
      where: {
        tenantId: request.user!.tenantId,
        buildingId: query.data.building_id
      },
      include: {
        entries: true,
        building: true
      },
      orderBy: [{ isDefault: "desc" }, { validFrom: "desc" }]
    });

    return { data: keys };
  });

  fastify.post(
    "/api/v1/allocation-keys",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin", "manager"])] },
    async (request, reply) => {
      const parsed = createAllocationKeySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid allocation key payload", details: parsed.error.flatten() });
      }

      const payload = parsed.data;
      const tenantId = request.user!.tenantId;

      if (payload.valid_to && payload.valid_to <= payload.valid_from) {
        return reply.code(400).send({ error: "valid_to must be after valid_from" });
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

      const key = await prisma.$transaction(async (tx) => {
        if (payload.is_default) {
          await (tx as any).tenantAllocationKey.updateMany({
            where: {
              tenantId,
              buildingId: payload.building_id ?? null
            },
            data: {
              isDefault: false
            }
          });
        }

        const created = await (tx as any).tenantAllocationKey.create({
          data: {
            tenantId,
            buildingId: payload.building_id ?? null,
            name: payload.name,
            method: payload.method,
            isDefault: payload.is_default,
            validFrom: payload.valid_from,
            validTo: payload.valid_to ?? null,
            notes: payload.notes
          }
        });

        if (payload.entries.length > 0) {
          await (tx as any).tenantAllocationKeyEntry.createMany({
            data: payload.entries.map((entry) => ({
              tenantId,
              allocationKeyId: created.id,
              unitId: entry.unit_id ?? null,
              label: entry.label,
              shareValue: entry.share_value,
              basisValue: entry.basis_value ?? null
            }))
          });
        }

        return created;
      });

      await writeAuditLog({
        tenantId,
        userId: request.user!.userId,
        action: "allocation_key.created",
        entityType: "allocation_key",
        entityId: key.id,
        payload
      });

      await writeBillingChangeLog({
        tenantId,
        userId: request.user!.userId,
        sourceModule: "billing_allocation",
        action: "allocation_key.created",
        entityType: "allocation_key",
        entityId: key.id,
        reason: "Tenant allocation baseline changed",
        changeSet: payload
      });

      return reply.code(201).send({ data: key });
    }
  );
};

export default allocationKeyRoutes;
