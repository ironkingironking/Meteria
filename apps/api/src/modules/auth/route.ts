import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@meteria/db";
import { verifyPassword } from "../../lib/security";

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  tenant_slug: z.string().optional()
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/v1/auth/login", async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid login payload", details: parsed.error.flatten() });
    }

    const { email, password, tenant_slug: tenantSlug } = parsed.data;

    const user = await prisma.user.findFirst({
      where: {
        email,
        tenant: tenantSlug ? { slug: tenantSlug } : undefined
      },
      include: {
        tenant: true
      }
    });

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const token = fastify.jwt.sign({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email
    });

    return reply.send({
      token,
      user: {
        id: user.id,
        tenant_id: user.tenantId,
        email: user.email,
        role: user.role,
        first_name: user.firstName,
        last_name: user.lastName
      },
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug
      }
    });
  });

  fastify.get("/api/v1/me", { preHandler: [fastify.authenticateUser] }, async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const user = await prisma.user.findFirst({
      where: {
        id: request.user.userId,
        tenantId: request.user.tenantId
      },
      include: {
        tenant: true
      }
    });

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    return reply.send({
      user: {
        id: user.id,
        tenant_id: user.tenantId,
        email: user.email,
        role: user.role,
        first_name: user.firstName,
        last_name: user.lastName
      },
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug
      }
    });
  });
};

export default authRoutes;
