import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { Prisma, prisma } from "@meteria/db";
import { buildInvoiceDraftComputation } from "@meteria/billing-engine";
import { writeAuditLog, writeBillingChangeLog } from "../../lib/audit";
import { buildBillingComputationPorts } from "./service-boundaries";

const generateDraftsSchema = z.object({
  building_id: z.string().uuid(),
  billing_period_id: z.string().uuid(),
  tax_rate: z.coerce.number().min(0).max(1).optional()
});

const billingRoutes: FastifyPluginAsync = async (fastify) => {
  const db = prisma as any;
  const billingPorts = buildBillingComputationPorts();

  fastify.post(
    "/api/v1/billing/generate-drafts",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin", "manager"])] },
    async (request, reply) => {
      const parsed = generateDraftsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid generate-drafts payload", details: parsed.error.flatten() });
      }

      const tenantId = request.user!.tenantId;
      const payload = parsed.data;

      const billingPeriod = await prisma.billingPeriod.findFirst({
        where: {
          id: payload.billing_period_id,
          tenantId,
          buildingId: payload.building_id
        }
      });

      if (!billingPeriod) {
        return reply.code(404).send({ error: "Billing period not found" });
      }

      const meters = await prisma.meter.findMany({
        where: {
          tenantId,
          buildingId: payload.building_id
        }
      });

      if (meters.length === 0) {
        return reply.code(400).send({ error: "No meters found for building" });
      }

      const tariffs = await prisma.tariff.findMany({
        where: {
          tenantId
        }
      });

      await prisma.invoiceDraft.deleteMany({
        where: {
          tenantId,
          buildingId: payload.building_id,
          billingPeriodId: payload.billing_period_id
        }
      });

      const grouped = new Map<string, typeof meters>();
      for (const meter of meters) {
        const key = meter.unitId ?? "__building__";
        const current = grouped.get(key) ?? [];
        current.push(meter);
        grouped.set(key, current);
      }

      const createdDrafts = [];

      for (const [groupKey, groupMeters] of grouped.entries()) {
        const computation = await buildInvoiceDraftComputation(prisma, {
          tenantId,
          buildingId: payload.building_id,
          unitId: groupKey === "__building__" ? null : groupKey,
          billingPeriodId: billingPeriod.id,
          billingPeriodName: billingPeriod.name,
          from: billingPeriod.periodStart,
          to: billingPeriod.periodEnd,
          meters: groupMeters.map((meter) => ({
            id: meter.id,
            externalId: meter.externalId,
            readingMode: meter.readingMode,
            unit: meter.unit,
            type: meter.type,
            multiplier: meter.multiplier
          })),
          tariffs: tariffs.map((tariff) => ({
            id: tariff.id,
            meterType: tariff.meterType,
            validFrom: tariff.validFrom,
            validTo: tariff.validTo,
            pricingModel: tariff.pricingModel,
            pricePerUnit: tariff.pricePerUnit,
            monthlyBaseFee: tariff.monthlyBaseFee,
            currency: tariff.currency
          })),
          taxRate: payload.tax_rate ?? null
        }, billingPorts);

        const draft = await prisma.invoiceDraft.create({
          data: {
            tenantId,
            buildingId: payload.building_id,
            unitId: groupKey === "__building__" ? null : groupKey,
            billingPeriodId: billingPeriod.id,
            tariffId: computation.tariffId,
            taxProfileId: computation.taxProfileId,
            totalConsumption: computation.totalConsumption,
            subtotal: computation.subtotal,
            taxRate: payload.tax_rate ?? null,
            taxHandlingMode: computation.taxHandlingMode,
            taxAmount: computation.taxAmount,
            totalAmount: computation.totalAmount,
            currency: computation.currency,
            status: computation.warningFlags.length > 0 ? "review_needed" : "draft",
            warningFlags: computation.warningFlags,
            breakdownJson: computation.breakdown as unknown as Prisma.InputJsonValue
          } as any
        });

        await db.calculationBreakdownSnapshot.create({
          data: {
            tenantId,
            billingPeriodId: billingPeriod.id,
            invoiceDraftId: draft.id,
            runLabel: "invoice_draft_generation",
            exportVersion: 1,
            breakdownJson: computation.breakdown as unknown as Prisma.InputJsonValue
          }
        });

        createdDrafts.push(draft);
      }

      await writeAuditLog({
        tenantId,
        userId: request.user!.userId,
        action: "billing.drafts.generated",
        entityType: "billing_period",
        entityId: billingPeriod.id,
        payload: {
          building_id: payload.building_id,
          billing_period_id: payload.billing_period_id,
          drafts_created: createdDrafts.length,
          tax_rate: payload.tax_rate ?? null
        }
      });

      await writeBillingChangeLog({
        tenantId,
        userId: request.user!.userId,
        sourceModule: "billing",
        action: "invoice_drafts.generated",
        entityType: "billing_period",
        entityId: billingPeriod.id,
        reason: "Draft generation triggered by user",
        changeSet: {
          buildingId: payload.building_id,
          billingPeriodId: payload.billing_period_id,
          draftCount: createdDrafts.length
        }
      });

      return reply.send({ data: createdDrafts });
    }
  );
};

export default billingRoutes;
