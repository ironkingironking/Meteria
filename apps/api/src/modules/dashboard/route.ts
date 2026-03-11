import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@meteria/db";
import { computeMeterConsumption } from "@meteria/billing-engine";

const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/dashboard/overview", { preHandler: [fastify.authenticateUser] }, async (request) => {
    const tenantId = request.user!.tenantId;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [buildingsCount, metersCount, ingestionCount, gateways] = await Promise.all([
      prisma.building.count({ where: { tenantId } }),
      prisma.meter.count({ where: { tenantId } }),
      prisma.meterReading.count({
        where: {
          tenantId,
          source: { in: ["gateway", "api"] },
          createdAt: { gte: since }
        }
      }),
      prisma.gateway.findMany({ where: { tenantId } })
    ]);

    const now = Date.now();
    const online = gateways.filter(
      (gateway) => gateway.lastSeenAt && now - gateway.lastSeenAt.getTime() <= 5 * 60 * 1000
    ).length;

    return {
      data: {
        total_buildings: buildingsCount,
        total_meters: metersCount,
        ingestion_last_24h: ingestionCount,
        gateways_online: online,
        gateways_offline: gateways.length - online,
        recent_anomalies: [
          {
            id: "placeholder-negative-delta",
            severity: "medium",
            message: "Anomaly detection is not active yet in MVP; advanced rules coming in roadmap."
          }
        ]
      }
    };
  });

  fastify.get(
    "/api/v1/dashboard/buildings/:id/consumption",
    { preHandler: [fastify.authenticateUser] },
    async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      const query = z
        .object({
          from: z.coerce.date(),
          to: z.coerce.date()
        })
        .safeParse(request.query);

      if (!params.success || !query.success) {
        return reply.code(400).send({ error: "Invalid dashboard consumption request" });
      }

      const tenantId = request.user!.tenantId;

      const building = await prisma.building.findFirst({
        where: {
          id: params.data.id,
          tenantId
        }
      });

      if (!building) {
        return reply.code(404).send({ error: "Building not found" });
      }

      const meters = await prisma.meter.findMany({
        where: {
          tenantId,
          buildingId: building.id
        }
      });

      let totalConsumption = 0;
      const perMeter: Array<{
        meter_id: string;
        meter_name: string;
        consumption: number;
        unit: string;
      }> = [];

      for (const meter of meters) {
        const { item } = await computeMeterConsumption(prisma, {
          tenantId,
          meterId: meter.id,
          meterExternalId: meter.externalId,
          readingMode: meter.readingMode,
          from: query.data.from,
          to: query.data.to,
          unit: meter.unit,
          multiplier: Number(meter.multiplier)
        });

        totalConsumption += item.consumption;
        perMeter.push({
          meter_id: meter.id,
          meter_name: meter.name,
          consumption: item.consumption,
          unit: meter.unit
        });
      }

      const monthlyData = await prisma.$queryRaw<
        Array<{ month: Date; meter_id: string; min_value: unknown; max_value: unknown; sum_value: unknown }>
      >`
        SELECT
          date_trunc('month', mr.timestamp) AS month,
          mr.meter_id,
          MIN(mr.value) AS min_value,
          MAX(mr.value) AS max_value,
          SUM(mr.value) AS sum_value
        FROM meter_readings mr
        JOIN meters m ON m.id = mr.meter_id
        WHERE mr.tenant_id = ${tenantId}::uuid
          AND m.building_id = ${building.id}::uuid
          AND mr.timestamp >= ${query.data.from}
          AND mr.timestamp <= ${query.data.to}
        GROUP BY month, mr.meter_id
        ORDER BY month ASC
      `;

      const meterMode = new Map(meters.map((meter) => [meter.id, meter.readingMode]));
      const byMonth = new Map<string, number>();

      for (const row of monthlyData) {
        const monthKey = row.month.toISOString().slice(0, 7);
        const mode = meterMode.get(row.meter_id);
        const monthValue =
          mode === "interval"
            ? Number(row.sum_value || 0)
            : Math.max(0, Number(row.max_value || 0) - Number(row.min_value || 0));

        byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + monthValue);
      }

      return reply.send({
        data: {
          building_id: building.id,
          period: {
            from: query.data.from,
            to: query.data.to
          },
          total_consumption: totalConsumption,
          meters: perMeter,
          monthly_chart: Array.from(byMonth.entries()).map(([month, value]) => ({ month, value }))
        }
      });
    }
  );

  fastify.get(
    "/api/v1/dashboard/meters/:id/timeseries",
    { preHandler: [fastify.authenticateUser] },
    async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      const query = z
        .object({
          from: z.coerce.date(),
          to: z.coerce.date(),
          limit: z.coerce.number().min(1).max(10000).default(1000)
        })
        .safeParse(request.query);

      if (!params.success || !query.success) {
        return reply.code(400).send({ error: "Invalid meter timeseries request" });
      }

      const meter = await prisma.meter.findFirst({
        where: {
          id: params.data.id,
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
        orderBy: { timestamp: "asc" },
        take: query.data.limit
      });

      return reply.send({
        data: {
          meter,
          points: readings.map((reading) => ({
            timestamp: reading.timestamp,
            value: Number(reading.value),
            unit: reading.unit,
            quality_flag: reading.qualityFlag,
            source: reading.source
          }))
        }
      });
    }
  );
};

export default dashboardRoutes;
