import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import { FastifyPluginAsync } from "fastify";
import { UserRole } from "@meteria/types";
import { prisma } from "@meteria/db";
import { env } from "../lib/env";
import { hashToken } from "../lib/security";

const authPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_EXPIRES_IN
    }
  });

  fastify.decorate("authenticateUser", async (request, reply) => {
    try {
      const payload = await request.jwtVerify<{
        sub: string;
        tenantId: string;
        role: UserRole;
        email: string;
      }>();

      request.user = {
        userId: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
        email: payload.email
      };
    } catch {
      reply.code(401).send({ error: "Unauthorized" });
    }
  });

  fastify.decorate("requireRole", (allowedRoles: UserRole[]) => {
    return async (request, reply) => {
      if (!request.user || !allowedRoles.includes(request.user.role)) {
        reply.code(403).send({ error: "Insufficient permissions" });
      }
    };
  });

  fastify.decorate("authenticateIngestion", async (request, reply) => {
    const gatewayToken = request.headers["x-gateway-token"];
    const apiKey = request.headers["x-api-key"];

    if (typeof gatewayToken === "string" && gatewayToken.length > 8) {
      const gateway = await prisma.gateway.findFirst({
        where: {
          authTokenHash: hashToken(gatewayToken)
        }
      });

      if (!gateway) {
        reply.code(401).send({ error: "Invalid gateway token" });
        return;
      }

      request.ingestionAuth = {
        tenantId: gateway.tenantId,
        gatewayId: gateway.id,
        apiKeyId: null
      };
      return;
    }

    if (typeof apiKey === "string" && apiKey.startsWith("mtr_")) {
      const [, keyPrefix] = apiKey.split("_");

      if (!keyPrefix) {
        reply.code(401).send({ error: "Invalid API key format" });
        return;
      }

      const record = await prisma.apiKey.findFirst({
        where: {
          keyPrefix
        }
      });

      if (!record || record.status !== "active" || record.keyHash !== hashToken(apiKey)) {
        reply.code(401).send({ error: "Invalid API key" });
        return;
      }

      request.ingestionAuth = {
        tenantId: record.tenantId,
        gatewayId: null,
        apiKeyId: record.id
      };
      return;
    }

    reply.code(401).send({ error: "Missing ingestion credentials" });
  });
};

export default fp(authPlugin, {
  name: "auth-plugin"
});
