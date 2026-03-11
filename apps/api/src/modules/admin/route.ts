import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@meteria/db";
import { generateOpaqueToken, hashPassword } from "../../lib/security";
import { writeAuditLog } from "../../lib/audit";

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "manager", "viewer"]),
  first_name: z.string().min(1),
  last_name: z.string().min(1)
});

const createApiKeySchema = z.object({
  name: z.string().min(2)
});

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/api/v1/admin/tenants",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin"])] },
    async (request) => {
      const tenant = await prisma.tenant.findFirst({
        where: {
          id: request.user!.tenantId
        }
      });

      return { data: tenant ? [tenant] : [] };
    }
  );

  fastify.get(
    "/api/v1/admin/users",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin"])] },
    async (request) => {
      const users = await prisma.user.findMany({
        where: {
          tenantId: request.user!.tenantId
        },
        orderBy: { createdAt: "desc" }
      });

      return {
        data: users.map((user) => ({
          id: user.id,
          tenant_id: user.tenantId,
          email: user.email,
          role: user.role,
          first_name: user.firstName,
          last_name: user.lastName,
          created_at: user.createdAt,
          updated_at: user.updatedAt
        }))
      };
    }
  );

  fastify.post(
    "/api/v1/admin/users",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin"])] },
    async (request, reply) => {
      const parsed = createUserSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid user payload", details: parsed.error.flatten() });
      }

      const payload = parsed.data;
      const user = await prisma.user.create({
        data: {
          tenantId: request.user!.tenantId,
          email: payload.email,
          passwordHash: await hashPassword(payload.password),
          role: payload.role,
          firstName: payload.first_name,
          lastName: payload.last_name
        }
      });

      await writeAuditLog({
        tenantId: request.user!.tenantId,
        userId: request.user!.userId,
        action: "admin.user.created",
        entityType: "user",
        entityId: user.id,
        payload: {
          email: payload.email,
          role: payload.role
        }
      });

      return reply.code(201).send({
        data: {
          id: user.id,
          email: user.email,
          role: user.role,
          first_name: user.firstName,
          last_name: user.lastName
        }
      });
    }
  );

  fastify.get(
    "/api/v1/admin/api-keys",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin"])] },
    async (request) => {
      const apiKeys = await prisma.apiKey.findMany({
        where: {
          tenantId: request.user!.tenantId
        },
        orderBy: { createdAt: "desc" }
      });

      return {
        data: apiKeys.map((key) => ({
          id: key.id,
          name: key.name,
          key_prefix: key.keyPrefix,
          status: key.status,
          created_at: key.createdAt
        }))
      };
    }
  );

  fastify.post(
    "/api/v1/admin/api-keys",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin"])] },
    async (request, reply) => {
      const parsed = createApiKeySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid API key payload", details: parsed.error.flatten() });
      }

      const key = generateOpaqueToken("mtr");
      const apiKey = await prisma.apiKey.create({
        data: {
          tenantId: request.user!.tenantId,
          name: parsed.data.name,
          keyPrefix: key.keyPrefix,
          keyHash: key.hash,
          status: "active"
        }
      });

      await writeAuditLog({
        tenantId: request.user!.tenantId,
        userId: request.user!.userId,
        action: "admin.api_key.created",
        entityType: "api_key",
        entityId: apiKey.id,
        payload: {
          name: parsed.data.name,
          key_prefix: key.keyPrefix
        }
      });

      return reply.code(201).send({
        data: {
          id: apiKey.id,
          name: apiKey.name,
          key_prefix: apiKey.keyPrefix,
          status: apiKey.status,
          created_at: apiKey.createdAt
        },
        api_key: key.plain,
        warning: "Store this API key securely. It will not be shown again."
      });
    }
  );

  fastify.get(
    "/api/v1/admin/gateways",
    { preHandler: [fastify.authenticateUser, fastify.requireRole(["admin"])] },
    async (request) => {
      const gateways = await prisma.gateway.findMany({
        where: { tenantId: request.user!.tenantId },
        orderBy: { createdAt: "desc" }
      });

      return { data: gateways };
    }
  );
};

export default adminRoutes;
