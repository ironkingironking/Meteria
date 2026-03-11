import { PrismaClient } from "@prisma/client";
import {
  AllocationMethod,
  InvoiceCalculationBreakdown,
  OperatingCostComponentType,
  ReadingCorrectionType,
  TaxHandlingMode
} from "@meteria/types";

export interface AllocationShare {
  unitId: string | null;
  shareValue: number;
  method: AllocationMethod;
  allocationKeyId: string;
}

export interface OperatingCostAllocation {
  componentId: string;
  componentName: string;
  componentType: OperatingCostComponentType;
  amount: number;
  currency: string;
  formula: string;
}

export interface MeterReplacementReference {
  eventId: string;
  oldMeterId: string;
  newMeterId: string;
}

export interface ReadingCorrectionReference {
  correctionEventId: string;
  originalReadingId: string;
  correctedReadingId: string;
  correctionType: ReadingCorrectionType;
}

export interface AllocationKeyResolver {
  resolveAllocationShare(input: {
    prisma: PrismaClient;
    tenantId: string;
    buildingId: string;
    unitId: string | null;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<AllocationShare | null>;
}

export interface OperatingCostResolver {
  resolveOperatingCosts(input: {
    prisma: PrismaClient;
    tenantId: string;
    buildingId: string;
    unitId: string | null;
    periodStart: Date;
    periodEnd: Date;
    totalConsumption: number;
  }): Promise<OperatingCostAllocation[]>;
}

export interface TaxPolicyResolver {
  resolveTaxPolicy(input: {
    prisma: PrismaClient;
    tenantId: string;
    buildingId: string;
    unitId: string | null;
    periodStart: Date;
    periodEnd: Date;
    proposedTaxRate: number | null;
  }): Promise<{ taxRate: number | null; taxHandlingMode: TaxHandlingMode | null; taxProfileId: string | null }>;
}

export interface ReadingRevisionResolver {
  resolveCorrections(input: {
    prisma: PrismaClient;
    tenantId: string;
    meterIds: string[];
    periodStart: Date;
    periodEnd: Date;
  }): Promise<ReadingCorrectionReference[]>;
}

export interface MeterReplacementResolver {
  resolveReplacementEvents(input: {
    prisma: PrismaClient;
    tenantId: string;
    meterIds: string[];
    periodStart: Date;
    periodEnd: Date;
  }): Promise<MeterReplacementReference[]>;
}

export interface BillingBreakdownSnapshotWriter {
  writeSnapshot(input: {
    prisma: PrismaClient;
    tenantId: string;
    billingPeriodId: string;
    invoiceDraftId: string | null;
    breakdown: InvoiceCalculationBreakdown;
  }): Promise<{ snapshotId: string } | null>;
}

export interface BillingComputationPorts {
  allocationKeyResolver: AllocationKeyResolver;
  operatingCostResolver: OperatingCostResolver;
  taxPolicyResolver: TaxPolicyResolver;
  readingRevisionResolver: ReadingRevisionResolver;
  meterReplacementResolver: MeterReplacementResolver;
  breakdownSnapshotWriter: BillingBreakdownSnapshotWriter;
}

class NoopAllocationKeyResolver implements AllocationKeyResolver {
  async resolveAllocationShare(): Promise<AllocationShare | null> {
    // TODO(DACH/CH): plug in legally compliant allocation key resolution.
    return null;
  }
}

class NoopOperatingCostResolver implements OperatingCostResolver {
  async resolveOperatingCosts(): Promise<OperatingCostAllocation[]> {
    // TODO(DACH/CH): support fixed + variable operating cost components.
    return [];
  }
}

class PassThroughTaxPolicyResolver implements TaxPolicyResolver {
  async resolveTaxPolicy(input: {
    proposedTaxRate: number | null;
  }): Promise<{ taxRate: number | null; taxHandlingMode: TaxHandlingMode | null; taxProfileId: string | null }> {
    // TODO(DACH/CH): map tax profile and handling mode by locale/accounting regime.
    return {
      taxRate: input.proposedTaxRate,
      taxHandlingMode: input.proposedTaxRate === null ? "exempt" : "exclusive",
      taxProfileId: null
    };
  }
}

class NoopReadingRevisionResolver implements ReadingRevisionResolver {
  async resolveCorrections(): Promise<ReadingCorrectionReference[]> {
    // TODO(DACH/CH): include estimated/corrected reading lineage in computation inputs.
    return [];
  }
}

class NoopMeterReplacementResolver implements MeterReplacementResolver {
  async resolveReplacementEvents(): Promise<MeterReplacementReference[]> {
    // TODO(DACH/CH): include meter replacement boundary handling.
    return [];
  }
}

class NoopBreakdownSnapshotWriter implements BillingBreakdownSnapshotWriter {
  async writeSnapshot(): Promise<{ snapshotId: string } | null> {
    // TODO(DACH/CH): persist immutable, exportable calculation snapshots.
    return null;
  }
}

export const createDefaultBillingComputationPorts = (): BillingComputationPorts => {
  return {
    allocationKeyResolver: new NoopAllocationKeyResolver(),
    operatingCostResolver: new NoopOperatingCostResolver(),
    taxPolicyResolver: new PassThroughTaxPolicyResolver(),
    readingRevisionResolver: new NoopReadingRevisionResolver(),
    meterReplacementResolver: new NoopMeterReplacementResolver(),
    breakdownSnapshotWriter: new NoopBreakdownSnapshotWriter()
  };
};
