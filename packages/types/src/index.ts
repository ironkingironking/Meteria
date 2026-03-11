export type UserRole = "admin" | "manager" | "viewer";
export type MeterType = "electricity" | "water_cold" | "water_hot" | "heat" | "gas";
export type MeterDirection = "consumption" | "production" | "bidirectional";
export type ReadingMode = "cumulative" | "interval";
export type ReadingQualityFlag = "ok" | "estimated" | "suspect" | "missing";
export type ReadingSource = "api" | "manual" | "import" | "gateway";

export type PricingModel = "flat_per_unit" | "tiered" | "monthly_fixed_plus_usage";
export type BillingPeriodStatus = "draft" | "locked" | "finalized";
export type BillingPeriodType = "monthly" | "quarterly" | "annual" | "custom";
export type InvoiceDraftStatus = "draft" | "review_needed" | "ready";
export type TaxHandlingMode = "exclusive" | "inclusive" | "exempt" | "reverse_charge";
export type AllocationMethod = "area_sqm" | "unit_count" | "occupancy" | "custom_share" | "meter_weighted";
export type OperatingCostComponentType = "fixed" | "variable";
export type ReadingCorrectionType =
  | "manual_correction"
  | "estimated_fill"
  | "replacement_adjustment"
  | "import_reconciliation";
export type ReadingLifecycleStatus = "original" | "estimated" | "corrected" | "superseded";

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  role: UserRole;
  email: string;
}

export interface BillingWarning {
  code: string;
  message: string;
  meterId?: string;
}

export interface ConsumptionComputation {
  meterId: string;
  meterExternalId: string | null;
  readingMode: ReadingMode;
  unit: string;
  startReading?: number | null;
  endReading?: number | null;
  consumption: number;
  warning?: BillingWarning;
}

export interface InvoiceCalculationBreakdown {
  billingPeriodId: string;
  billingPeriodName: string;
  buildingId: string;
  unitId: string | null;
  tariffId: string | null;
  currency: string;
  formula: string;
  breakdownVersion?: number;
  taxHandlingMode?: TaxHandlingMode | null;
  allocationKeyId?: string | null;
  allocationMethod?: AllocationMethod | null;
  operatingCostComponents?: Array<{
    componentId: string;
    componentName: string;
    componentType: OperatingCostComponentType;
    amount: number;
    currency: string;
    formula?: string;
  }>;
  meterReplacementReferences?: Array<{
    eventId: string;
    oldMeterId: string;
    newMeterId: string;
  }>;
  readingCorrectionReferences?: Array<{
    correctionEventId: string;
    originalReadingId: string;
    correctedReadingId: string;
    correctionType: ReadingCorrectionType;
  }>;
  auditReferences?: Array<{
    billingChangeLogId: string;
    action: string;
  }>;
  items: ConsumptionComputation[];
  subtotal: number;
  taxRate: number | null;
  taxAmount: number | null;
  total: number;
  warnings: BillingWarning[];
}
