import { Prisma, prisma } from "@meteria/db";

const toPrismaJsonNestedValue = (value: unknown): Prisma.InputJsonValue | null => {
  if (value === null) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toPrismaJsonNestedValue(item)) as Prisma.InputJsonArray;
  }

  if (typeof value === "object") {
    const result: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      if (entryValue !== undefined) {
        result[key] = toPrismaJsonNestedValue(entryValue);
      }
    }
    return result;
  }

  return String(value);
};

const toPrismaJsonValue = (value: unknown): Prisma.InputJsonValue => {
  if (value === null) {
    throw new Error("Top-level null JSON values must be handled with Prisma.JsonNull");
  }

  return toPrismaJsonNestedValue(value) as Prisma.InputJsonValue;
};

interface AuditPayload {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  payload?: unknown;
}

export const writeAuditLog = async ({
  tenantId = null,
  userId = null,
  action,
  entityType,
  entityId,
  payload
}: AuditPayload): Promise<void> => {
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action,
      entityType,
      entityId,
      payloadJson:
        payload === null ? Prisma.JsonNull : payload !== undefined ? toPrismaJsonValue(payload) : undefined
    }
  });
};

interface BillingChangePayload {
  tenantId: string;
  userId?: string | null;
  sourceModule: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string;
  changeSet?: unknown;
}

export const writeBillingChangeLog = async ({
  tenantId,
  userId = null,
  sourceModule,
  action,
  entityType,
  entityId,
  reason,
  changeSet
}: BillingChangePayload): Promise<void> => {
  await prisma.billingChangeLog.create({
    data: {
      tenantId,
      userId,
      sourceModule,
      action,
      entityType,
      entityId,
      reason,
      changeSetJson:
        changeSet === null ? Prisma.JsonNull : changeSet !== undefined ? toPrismaJsonValue(changeSet) : undefined
    }
  });
};
