import "fastify";
import { UserRole } from "@meteria/types";

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      userId: string;
      tenantId: string;
      role: UserRole;
      email: string;
    };
    ingestionAuth?: {
      tenantId: string;
      gatewayId: string | null;
      apiKeyId: string | null;
    };
  }

  interface FastifyInstance {
    authenticateUser: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateIngestion: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (
      allowedRoles: UserRole[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
