import { Prisma, PrismaClient, PricingModel } from "@prisma/client";
import {
  BillingWarning,
  ConsumptionComputation,
  InvoiceCalculationBreakdown
} from "@meteria/types";
import {
  BillingComputationPorts,
  createDefaultBillingComputationPorts
} from "./interfaces";

export interface MeterConsumptionInput {
  tenantId: string;
  meterId: string;
  meterExternalId: string | null;
  readingMode: "cumulative" | "interval";
  from: Date;
  to: Date;
  unit: string;
  multiplier?: number;
}

const decimalToNumber = (value: Prisma.Decimal | number | null | undefined): number => {
  if (value === null || value === undefined) {
    return 0;
  }

  return typeof value === "number" ? value : value.toNumber();
};

export const computeMeterConsumption = async (
  prisma: PrismaClient,
  input: MeterConsumptionInput
): Promise<{ item: ConsumptionComputation; warnings: BillingWarning[] }> => {
  if (input.readingMode === "interval") {
    const sumResult = await prisma.meterReading.aggregate({
      where: {
        tenantId: input.tenantId,
        meterId: input.meterId,
        timestamp: {
          gt: input.from,
          lte: input.to
        }
      },
      _sum: { value: true }
    });

    const sum = decimalToNumber(sumResult._sum.value);
    const consumption = sum * (input.multiplier ?? 1);

    return {
      item: {
        meterId: input.meterId,
        meterExternalId: input.meterExternalId,
        readingMode: "interval",
        unit: input.unit,
        consumption
      },
      warnings: []
    };
  }

  const [start, end] = await Promise.all([
    prisma.meterReading.findFirst({
      where: {
        tenantId: input.tenantId,
        meterId: input.meterId,
        timestamp: { lte: input.from }
      },
      orderBy: { timestamp: "desc" }
    }),
    prisma.meterReading.findFirst({
      where: {
        tenantId: input.tenantId,
        meterId: input.meterId,
        timestamp: { lte: input.to }
      },
      orderBy: { timestamp: "desc" }
    })
  ]);

  const warnings: BillingWarning[] = [];

  if (!start || !end) {
    warnings.push({
      code: "MISSING_READINGS",
      message: "Cumulative meter has insufficient readings in billing window.",
      meterId: input.meterId
    });

    return {
      item: {
        meterId: input.meterId,
        meterExternalId: input.meterExternalId,
        readingMode: "cumulative",
        unit: input.unit,
        startReading: start ? decimalToNumber(start.value) : null,
        endReading: end ? decimalToNumber(end.value) : null,
        consumption: 0,
        warning: warnings[0]
      },
      warnings
    };
  }

  const startValue = decimalToNumber(start.value);
  const endValue = decimalToNumber(end.value);
  const diff = Math.max(0, endValue - startValue);
  const consumption = diff * (input.multiplier ?? 1);

  if (endValue < startValue) {
    warnings.push({
      code: "NEGATIVE_DELTA",
      message: "End reading is below start reading, likely meter reset or data quality issue.",
      meterId: input.meterId
    });
  }

  return {
    item: {
      meterId: input.meterId,
      meterExternalId: input.meterExternalId,
      readingMode: "cumulative",
      unit: input.unit,
      startReading: startValue,
      endReading: endValue,
      consumption
    },
    warnings
  };
};

interface TariffLike {
  id: string;
  pricingModel: PricingModel;
  pricePerUnit: Prisma.Decimal | null;
  monthlyBaseFee: Prisma.Decimal | null;
  currency: string;
}

export interface BuildInvoiceDraftInput {
  tenantId: string;
  buildingId: string;
  unitId: string | null;
  billingPeriodId: string;
  billingPeriodName: string;
  from: Date;
  to: Date;
  meters: Array<{
    id: string;
    externalId: string;
    readingMode: "cumulative" | "interval";
    unit: string;
    type: string;
    multiplier: Prisma.Decimal;
  }>;
  tariffs: Array<{
    id: string;
    meterType: string;
    validFrom: Date;
    validTo: Date | null;
    pricingModel: PricingModel;
    pricePerUnit: Prisma.Decimal | null;
    monthlyBaseFee: Prisma.Decimal | null;
    currency: string;
  }>;
  taxRate: number | null;
}

export const buildInvoiceDraftComputation = async (
  prisma: PrismaClient,
  input: BuildInvoiceDraftInput,
  ports: BillingComputationPorts = createDefaultBillingComputationPorts()
): Promise<{
  totalConsumption: number;
  subtotal: number;
  taxAmount: number | null;
  totalAmount: number;
  currency: string;
  taxHandlingMode: "exclusive" | "inclusive" | "exempt" | "reverse_charge" | null;
  taxProfileId: string | null;
  warningFlags: string[];
  breakdown: InvoiceCalculationBreakdown;
  tariffId: string | null;
  breakdownSnapshotId: string | null;
}> => {
  const warnings: BillingWarning[] = [];
  const items: ConsumptionComputation[] = [];
  const usedTariffs: TariffLike[] = [];
  const formulaParts: string[] = [];
  let usageSubtotal = 0;
  let baseFeeSubtotal = 0;
  let baseFeeApplied = false;

  for (const meter of input.meters) {
    const result = await computeMeterConsumption(prisma, {
      tenantId: input.tenantId,
      meterId: meter.id,
      meterExternalId: meter.externalId,
      readingMode: meter.readingMode,
      from: input.from,
      to: input.to,
      unit: meter.unit,
      multiplier: decimalToNumber(meter.multiplier)
    });

    items.push(result.item);
    warnings.push(...result.warnings);

    const activeTariff = input.tariffs.find((tariff) => {
      const isTypeMatch = tariff.meterType === meter.type;
      const isStarted = tariff.validFrom <= input.to;
      const isNotEnded = !tariff.validTo || tariff.validTo >= input.from;
      return isTypeMatch && isStarted && isNotEnded;
    });

    if (!activeTariff) {
      warnings.push({
        code: "MISSING_TARIFF",
        message: `No active tariff found for meter type ${meter.type}.`,
        meterId: meter.id
      });
      continue;
    }

    usedTariffs.push(activeTariff);

    const usagePrice = decimalToNumber(activeTariff.pricePerUnit);
    usageSubtotal += result.item.consumption * usagePrice;
    formulaParts.push(
      `${result.item.meterExternalId ?? result.item.meterId}: ${result.item.consumption.toFixed(3)} * ${usagePrice}`
    );

    if (activeTariff.pricingModel === "monthly_fixed_plus_usage" && !baseFeeApplied) {
      const baseFee = decimalToNumber(activeTariff.monthlyBaseFee);
      baseFeeSubtotal += baseFee;
      baseFeeApplied = true;
      formulaParts.push(`base_fee: ${baseFee}`);
    }
  }

  const replacementReferences = await ports.meterReplacementResolver.resolveReplacementEvents({
    prisma,
    tenantId: input.tenantId,
    meterIds: input.meters.map((meter) => meter.id),
    periodStart: input.from,
    periodEnd: input.to
  });

  const correctionReferences = await ports.readingRevisionResolver.resolveCorrections({
    prisma,
    tenantId: input.tenantId,
    meterIds: input.meters.map((meter) => meter.id),
    periodStart: input.from,
    periodEnd: input.to
  });

  const allocationShare = await ports.allocationKeyResolver.resolveAllocationShare({
    prisma,
    tenantId: input.tenantId,
    buildingId: input.buildingId,
    unitId: input.unitId,
    periodStart: input.from,
    periodEnd: input.to
  });

  const totalConsumption = items.reduce((sum, item) => sum + item.consumption, 0);

  const operatingCostComponents = await ports.operatingCostResolver.resolveOperatingCosts({
    prisma,
    tenantId: input.tenantId,
    buildingId: input.buildingId,
    unitId: input.unitId,
    periodStart: input.from,
    periodEnd: input.to,
    totalConsumption
  });

  const operatingCostTotal = operatingCostComponents.reduce((sum, component) => sum + component.amount, 0);
  const subtotal = usageSubtotal + baseFeeSubtotal + operatingCostTotal;

  const taxPolicy = await ports.taxPolicyResolver.resolveTaxPolicy({
    prisma,
    tenantId: input.tenantId,
    buildingId: input.buildingId,
    unitId: input.unitId,
    periodStart: input.from,
    periodEnd: input.to,
    proposedTaxRate: input.taxRate
  });

  const taxAmount = taxPolicy.taxRate !== null ? subtotal * taxPolicy.taxRate : null;
  const totalAmount = subtotal + (taxAmount ?? 0);
  const currency = usedTariffs[0]?.currency ?? "CHF";

  const formula = formulaParts.join(" + ") || "0";

  const breakdown: InvoiceCalculationBreakdown = {
    billingPeriodId: input.billingPeriodId,
    billingPeriodName: input.billingPeriodName,
    buildingId: input.buildingId,
    unitId: input.unitId,
    tariffId: usedTariffs[0]?.id ?? null,
    currency,
    formula,
    breakdownVersion: 1,
    taxHandlingMode: taxPolicy.taxHandlingMode,
    allocationKeyId: allocationShare?.allocationKeyId ?? null,
    allocationMethod: allocationShare?.method ?? null,
    operatingCostComponents: operatingCostComponents.map((component) => ({
      componentId: component.componentId,
      componentName: component.componentName,
      componentType: component.componentType,
      amount: component.amount,
      currency: component.currency,
      formula: component.formula
    })),
    meterReplacementReferences: replacementReferences,
    readingCorrectionReferences: correctionReferences,
    items,
    subtotal,
    taxRate: taxPolicy.taxRate,
    taxAmount,
    total: totalAmount,
    warnings
  };

  const snapshotWrite = await ports.breakdownSnapshotWriter.writeSnapshot({
    prisma,
    tenantId: input.tenantId,
    billingPeriodId: input.billingPeriodId,
    invoiceDraftId: null,
    breakdown
  });

  return {
    totalConsumption,
    subtotal,
    taxAmount,
    totalAmount,
    currency,
    taxHandlingMode: taxPolicy.taxHandlingMode,
    taxProfileId: taxPolicy.taxProfileId,
    warningFlags: warnings.map((warning) => warning.code),
    breakdown,
    tariffId: usedTariffs[0]?.id ?? null,
    breakdownSnapshotId: snapshotWrite?.snapshotId ?? null
  };
};

export * from "./interfaces";
