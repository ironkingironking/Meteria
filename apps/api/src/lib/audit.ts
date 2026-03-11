import { prisma } from "@meteria/db";

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
      payloadJson: payload ? (payload as object) : undefined
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
  await (prisma as any).billingChangeLog.create({
    data: {
      tenantId,
      userId,
      sourceModule,
      action,
      entityType,
      entityId,
      reason,
      changeSetJson: changeSet ? (changeSet as object) : undefined
    }
  });
};
