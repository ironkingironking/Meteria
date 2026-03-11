import { FastifyReply } from "fastify";

export const forbidden = (reply: FastifyReply, message = "Forbidden"): FastifyReply => {
  return reply.code(403).send({ error: message });
};

export const badRequest = (reply: FastifyReply, message: string, details?: unknown): FastifyReply => {
  return reply.code(400).send({ error: message, details });
};

export const notFound = (reply: FastifyReply, message: string): FastifyReply => {
  return reply.code(404).send({ error: message });
};
