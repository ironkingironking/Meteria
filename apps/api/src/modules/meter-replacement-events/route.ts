import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@meteria/db";
import { writeAuditLog, writeBillingChangeLog } from "../../lib/audit";

const createReplacementSchema = z.object({
  building_id: z.string().uuid(),
  old_meter_id: z.string().uuid(),
  new_meter_id: z.string().uuid(),
  replaced_at: z.coerce.date(),
  final_reading_old: z.coerce.number().nullable().optional(),
  initial_reading_new: z.coerce.number().nullable().optional(),
  reason: z.string().min(3),
  notes: z.string().optional()
});

const meterReplacementEventsRoutes: FastifyPluginAsync = async (fastify) => {
  const db = prisma as any;

  fastify.get(
    "/api/v1/meter-replacement-events",
    { preHandler: [fastify.authenticateUser] },
    async (request, reply) => {
      const query = z
        .object({
          building_id: z.string().uuid().optional(),
          meter_id: z.string().uuid().optional()
        })
        .safeParse(request.query);

      if (!query.success) {
        return reply.code(400).send({ error: "Invalid query" });
      }

      const events = await db.meterReplacementEvent.findMany({
        where: {
          tenantId: request.user!.tenantId,
          buildingId: query.data.building_id,
          OR: query.data.meter_id
            ? [{ oldMeterId: query.data.meter_id }, { newMeterId: query.data.meter_id }]
            : undefined
        },
        include: {
          oldMeter: true,
          newMeter: true,
          building: true,
          createdBy: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: { replacedAt: "desc" }
      });

      return { data: events };
    }
  );

  fastify.post(
    "/api/v1/meter-replacement-events",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin", "manager"])] },
    async (request, reply) => {
      const parsed = createReplacementSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid replacement payload", details: parsed.error.flatten() });
      }

      const payload = parsed.data;
      const tenantId = request.user!.tenantId;

      const [building, oldMeter, newMeter] = await Promise.all([
        prisma.building.findFirst({
          where: {
            id: payload.building_id,
            tenantId
          }
        }),
        prisma.meter.findFirst({
          where: {
            id: payload.old_meter_id,
            tenantId
          }
        }),
        prisma.meter.findFirst({
          where: {
            id: payload.new_meter_id,
            tenantId
          }
        })
      ]);

      if (!building) {
        return reply.code(404).send({ error: "Building not found" });
      }

      if (!oldMeter || !newMeter) {
        return reply.code(404).send({ error: "Old or new meter not found" });
      }

      if (oldMeter.id === newMeter.id) {
        return reply.code(400).send({ error: "old_meter_id and new_meter_id must be different" });
      }

      if (oldMeter.buildingId !== building.id || newMeter.buildingId !== building.id) {
        return reply.code(400).send({ error: "Meters must belong to the same building" });
      }

      const event = await prisma.$transaction(async (tx) => {
        const created = await (tx as any).meterReplacementEvent.create({
          data: {
            tenantId,
            buildingId: building.id,
            oldMeterId: oldMeter.id,
            newMeterId: newMeter.id,
            replacedAt: payload.replaced_at,
            finalReadingOld: payload.final_reading_old ?? null,
            initialReadingNew: payload.initial_reading_new ?? null,
            reason: payload.reason,
            notes: payload.notes,
            createdByUserId: request.user!.userId
          }
        });

        await tx.meter.update({
          where: { id: oldMeter.id },
          data: { decommissionedAt: payload.replaced_at }
        });

        return created;
      });

      await writeAuditLog({
        tenantId,
        userId: request.user!.userId,
        action: "meter.replacement_recorded",
        entityType: "meter_replacement_event",
        entityId: event.id,
        payload
      });

      await writeBillingChangeLog({
        tenantId,
        userId: request.user!.userId,
        sourceModule: "meter_replacement",
        action: "meter.replacement_recorded",
        entityType: "meter_replacement_event",
        entityId: event.id,
        reason: payload.reason,
        changeSet: payload
      });

      return reply.code(201).send({ data: event });
    }
  );
};

export default meterReplacementEventsRoutes;
