import { FastifyPluginAsync } from "fastify";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { prisma } from "@meteria/db";
import { toCsv } from "@meteria/utils";

const exportsRoutes: FastifyPluginAsync = async (fastify) => {
  const db = prisma as any;

  fastify.get(
    "/api/v1/exports/readings.csv",
    { preHandler: [fastify.authenticateUser] },
    async (request, reply) => {
      const query = z
        .object({
          meter_id: z.string().uuid(),
          from: z.coerce.date(),
          to: z.coerce.date()
        })
        .safeParse(request.query);

      if (!query.success) {
        return reply.code(400).send({ error: "Invalid readings export query" });
      }

      const meter = await prisma.meter.findFirst({
        where: {
          id: query.data.meter_id,
          tenantId: request.user!.tenantId
        }
      });

      if (!meter) {
        return reply.code(404).send({ error: "Meter not found" });
      }

      const readings = await prisma.meterReading.findMany({
        where: {
          tenantId: request.user!.tenantId,
          meterId: meter.id,
          timestamp: {
            gte: query.data.from,
            lte: query.data.to
          }
        },
        orderBy: { timestamp: "asc" }
      });

      const csv = toCsv(
        readings.map((reading) => ({
          id: reading.id,
          meter_id: reading.meterId,
          timestamp: reading.timestamp.toISOString(),
          value: Number(reading.value),
          unit: reading.unit,
          quality_flag: reading.qualityFlag,
          source: reading.source,
          created_at: reading.createdAt.toISOString()
        }))
      );

      reply.header("content-type", "text/csv");
      reply.header("content-disposition", `attachment; filename=\"meter-readings-${meter.id}.csv\"`);
      return reply.send(csv);
    }
  );

  fastify.get(
    "/api/v1/exports/invoice-drafts.csv",
    { preHandler: [fastify.authenticateUser] },
    async (request, reply) => {
      const query = z.object({ billing_period_id: z.string().uuid().optional() }).safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send({ error: "Invalid invoice export query" });
      }

      const drafts = await prisma.invoiceDraft.findMany({
        where: {
          tenantId: request.user!.tenantId,
          billingPeriodId: query.data.billing_period_id
        },
        include: {
          building: true,
          unit: true,
          billingPeriod: true
        },
        orderBy: { createdAt: "desc" }
      });

      const csv = toCsv(
        drafts.map((draft) => ({
          id: draft.id,
          billing_period: draft.billingPeriod.name,
          building: draft.building.name,
          unit: draft.unit?.name ?? "(building-level)",
          total_consumption: Number(draft.totalConsumption),
          subtotal: Number(draft.subtotal),
          tax_amount: draft.taxAmount ? Number(draft.taxAmount) : null,
          total_amount: Number(draft.totalAmount),
          currency: draft.currency,
          status: draft.status,
          warnings: draft.warningFlags.join("|")
        }))
      );

      reply.header("content-type", "text/csv");
      reply.header("content-disposition", "attachment; filename=\"invoice-drafts.csv\"");
      return reply.send(csv);
    }
  );

  fastify.get(
    "/api/v1/exports/invoice-drafts/:id/pdf",
    { preHandler: [fastify.authenticateUser] },
    async (request, reply) => {
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
          building: true,
          unit: true,
          billingPeriod: true
        }
      });

      if (!draft) {
        return reply.code(404).send({ error: "Invoice draft not found" });
      }

      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));

      doc.fontSize(20).text("Meteria Invoice Draft", { align: "left" });
      doc.moveDown();
      doc.fontSize(11);
      doc.text(`Invoice draft ID: ${draft.id}`);
      doc.text(`Billing period: ${draft.billingPeriod.name}`);
      doc.text(`Building: ${draft.building.name}`);
      doc.text(`Unit: ${draft.unit?.name ?? "Building-level"}`);
      doc.text(`Consumption: ${Number(draft.totalConsumption).toFixed(3)}`);
      doc.text(`Subtotal: ${Number(draft.subtotal).toFixed(2)} ${draft.currency}`);
      doc.text(`Tax amount: ${draft.taxAmount ? Number(draft.taxAmount).toFixed(2) : "0.00"} ${draft.currency}`);
      doc.text(`Total amount: ${Number(draft.totalAmount).toFixed(2)} ${draft.currency}`);
      doc.moveDown();
      doc.text("This is an MVP placeholder PDF template.");

      doc.end();

      await new Promise<void>((resolve) => {
        doc.on("end", () => resolve());
      });

      const pdf = Buffer.concat(chunks);

      reply.header("content-type", "application/pdf");
      reply.header("content-disposition", `attachment; filename=\"invoice-draft-${draft.id}.pdf\"`);
      return reply.send(pdf);
    }
  );

  fastify.get(
    "/api/v1/exports/integrations.json",
    { preHandler: [fastify.authenticateUser] },
    async (request) => {
      const tenantId = request.user!.tenantId;

      const [buildings, meters, tariffs, periods, drafts] = await Promise.all([
        prisma.building.findMany({ where: { tenantId } }),
        prisma.meter.findMany({ where: { tenantId } }),
        prisma.tariff.findMany({ where: { tenantId } }),
        prisma.billingPeriod.findMany({ where: { tenantId } }),
        prisma.invoiceDraft.findMany({ where: { tenantId } })
      ]);

      return {
        data: {
          tenant_id: tenantId,
          exported_at: new Date().toISOString(),
          buildings,
          meters,
          tariffs,
          billing_periods: periods,
          invoice_drafts: drafts
        }
      };
    }
  );

  fastify.get(
    "/api/v1/exports/calculation-breakdowns.json",
    { preHandler: [fastify.authenticateUser] },
    async (request, reply) => {
      const query = z
        .object({
          billing_period_id: z.string().uuid().optional(),
          invoice_draft_id: z.string().uuid().optional(),
          limit: z.coerce.number().min(1).max(1000).default(200)
        })
        .safeParse(request.query);

      if (!query.success) {
        return reply.code(400).send({ error: "Invalid calculation breakdown export query" });
      }

      const snapshots = await db.calculationBreakdownSnapshot.findMany({
        where: {
          tenantId: request.user!.tenantId,
          billingPeriodId: query.data.billing_period_id,
          invoiceDraftId: query.data.invoice_draft_id
        },
        include: {
          billingPeriod: true,
          invoiceDraft: true
        },
        orderBy: { createdAt: "desc" },
        take: query.data.limit
      });

      return reply.send({
        data: snapshots
      });
    }
  );
};

export default exportsRoutes;
