import "dotenv/config";
import pino from "pino";
import { prisma } from "@meteria/db";

const logger = pino({
  name: "meteria-worker",
  level: process.env.LOG_LEVEL || "info"
});

const intervalMs = Number(process.env.WORKER_INTERVAL_MS || 30000);

const markGatewayHealth = async (): Promise<void> => {
  const onlineThreshold = new Date(Date.now() - 5 * 60 * 1000);

  const [onlineResult, offlineResult] = await Promise.all([
    prisma.gateway.updateMany({
      where: {
        lastSeenAt: {
          gte: onlineThreshold
        }
      },
      data: {
        status: "online"
      }
    }),
    prisma.gateway.updateMany({
      where: {
        OR: [
          {
            lastSeenAt: {
              lt: onlineThreshold
            }
          },
          {
            lastSeenAt: null
          }
        ]
      },
      data: {
        status: "offline"
      }
    })
  ]);

  logger.info(
    {
      onlineUpdated: onlineResult.count,
      offlineUpdated: offlineResult.count
    },
    "gateway health status updated"
  );
};

const processQueuedBillingJobs = async (): Promise<void> => {
  // Placeholder worker loop. In future versions this can process a billing jobs table.
  const count = await prisma.billingPeriod.count({
    where: {
      status: "draft"
    }
  });

  logger.debug({ draftBillingPeriods: count }, "billing queue heartbeat");
};

const run = async (): Promise<void> => {
  logger.info({ intervalMs }, "worker started");

  await markGatewayHealth();
  await processQueuedBillingJobs();

  setInterval(async () => {
    try {
      await markGatewayHealth();
      await processQueuedBillingJobs();
    } catch (error) {
      logger.error({ err: error }, "worker tick failed");
    }
  }, intervalMs);
};

run().catch((error) => {
  logger.error({ err: error }, "worker startup failed");
  process.exit(1);
});
