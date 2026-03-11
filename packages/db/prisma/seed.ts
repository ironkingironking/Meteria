import "dotenv/config";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

async function seed(): Promise<void> {
  const adminEmail = process.env.DEMO_ADMIN_EMAIL || "admin@demo.meteria.local";
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD || "ChangeMe123!";

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-tenant" },
    update: {
      name: "Demo Property Group"
    },
    create: {
      name: "Demo Property Group",
      slug: "demo-tenant"
    }
  });

  const adminPasswordHash = await bcrypt.hash(adminPassword, 12);

  const adminUser = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: adminEmail
      }
    },
    update: {
      passwordHash: adminPasswordHash,
      role: "admin",
      firstName: "Demo",
      lastName: "Admin"
    },
    create: {
      tenantId: tenant.id,
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: "admin",
      firstName: "Demo",
      lastName: "Admin"
    }
  });

  const [buildingA, buildingB] = await Promise.all([
    prisma.building.upsert({
      where: { id: "11111111-1111-1111-1111-111111111111" },
      update: {
        tenantId: tenant.id,
        name: "Limmat Campus A",
        addressLine1: "Limmatstrasse 10",
        postalCode: "8005",
        city: "Zurich",
        country: "CH",
        timezone: "Europe/Zurich"
      },
      create: {
        id: "11111111-1111-1111-1111-111111111111",
        tenantId: tenant.id,
        name: "Limmat Campus A",
        externalReference: "BLD-001",
        addressLine1: "Limmatstrasse 10",
        postalCode: "8005",
        city: "Zurich",
        country: "CH",
        timezone: "Europe/Zurich"
      }
    }),
    prisma.building.upsert({
      where: { id: "22222222-2222-2222-2222-222222222222" },
      update: {
        tenantId: tenant.id,
        name: "Aare Yard B",
        addressLine1: "Aareweg 22",
        postalCode: "3000",
        city: "Bern",
        country: "CH",
        timezone: "Europe/Zurich"
      },
      create: {
        id: "22222222-2222-2222-2222-222222222222",
        tenantId: tenant.id,
        name: "Aare Yard B",
        externalReference: "BLD-002",
        addressLine1: "Aareweg 22",
        postalCode: "3000",
        city: "Bern",
        country: "CH",
        timezone: "Europe/Zurich"
      }
    })
  ]);

  const [unitA1, unitA2, unitB1] = await Promise.all([
    prisma.unit.upsert({
      where: { id: "aaaa1111-1111-1111-1111-111111111111" },
      update: {
        buildingId: buildingA.id,
        name: "Apt 1.1",
        unitNumber: "1.1",
        floor: "1",
        areaSqm: 78,
        usageType: "residential"
      },
      create: {
        id: "aaaa1111-1111-1111-1111-111111111111",
        buildingId: buildingA.id,
        name: "Apt 1.1",
        unitNumber: "1.1",
        floor: "1",
        areaSqm: 78,
        usageType: "residential"
      }
    }),
    prisma.unit.upsert({
      where: { id: "aaaa2222-2222-2222-2222-222222222222" },
      update: {
        buildingId: buildingA.id,
        name: "Apt 2.2",
        unitNumber: "2.2",
        floor: "2",
        areaSqm: 92,
        usageType: "residential"
      },
      create: {
        id: "aaaa2222-2222-2222-2222-222222222222",
        buildingId: buildingA.id,
        name: "Apt 2.2",
        unitNumber: "2.2",
        floor: "2",
        areaSqm: 92,
        usageType: "residential"
      }
    }),
    prisma.unit.upsert({
      where: { id: "bbbb1111-1111-1111-1111-111111111111" },
      update: {
        buildingId: buildingB.id,
        name: "Shop G1",
        unitNumber: "G1",
        floor: "0",
        areaSqm: 135,
        usageType: "retail"
      },
      create: {
        id: "bbbb1111-1111-1111-1111-111111111111",
        buildingId: buildingB.id,
        name: "Shop G1",
        unitNumber: "G1",
        floor: "0",
        areaSqm: 135,
        usageType: "retail"
      }
    })
  ]);

  const gatewayTokenA = "gtw_demo_a_token";
  const gatewayTokenB = "gtw_demo_b_token";

  const [gatewayA, gatewayB] = await Promise.all([
    prisma.gateway.upsert({
      where: { id: "33333333-3333-3333-3333-333333333333" },
      update: {
        tenantId: tenant.id,
        buildingId: buildingA.id,
        name: "Gateway A",
        serialNumber: "rpi5-lu-001",
        authTokenHash: hashToken(gatewayTokenA),
        status: "online",
        lastSeenAt: new Date(),
        firmwareVersion: "1.3.0"
      },
      create: {
        id: "33333333-3333-3333-3333-333333333333",
        tenantId: tenant.id,
        buildingId: buildingA.id,
        name: "Gateway A",
        serialNumber: "rpi5-lu-001",
        authTokenHash: hashToken(gatewayTokenA),
        status: "online",
        lastSeenAt: new Date(),
        firmwareVersion: "1.3.0"
      }
    }),
    prisma.gateway.upsert({
      where: { id: "44444444-4444-4444-4444-444444444444" },
      update: {
        tenantId: tenant.id,
        buildingId: buildingB.id,
        name: "Gateway B",
        serialNumber: "rpi5-be-002",
        authTokenHash: hashToken(gatewayTokenB),
        status: "online",
        lastSeenAt: new Date(),
        firmwareVersion: "1.3.0"
      },
      create: {
        id: "44444444-4444-4444-4444-444444444444",
        tenantId: tenant.id,
        buildingId: buildingB.id,
        name: "Gateway B",
        serialNumber: "rpi5-be-002",
        authTokenHash: hashToken(gatewayTokenB),
        status: "online",
        lastSeenAt: new Date(),
        firmwareVersion: "1.3.0"
      }
    })
  ]);

  const meterDefs = [
    {
      id: "50000000-0000-0000-0000-000000000001",
      buildingId: buildingA.id,
      unitId: null,
      meterNumber: "M-A-HEAT-001",
      externalId: "heat-main-001",
      name: "Main Heat",
      type: "heat" as const,
      medium: "district_heat",
      unit: "kWh",
      direction: "consumption" as const,
      readingMode: "cumulative" as const
    },
    {
      id: "50000000-0000-0000-0000-000000000002",
      buildingId: buildingA.id,
      unitId: unitA1.id,
      meterNumber: "M-A-WC-002",
      externalId: "water-cold-002",
      name: "Water Cold Apt 1.1",
      type: "water_cold" as const,
      medium: "water",
      unit: "m3",
      direction: "consumption" as const,
      readingMode: "cumulative" as const
    },
    {
      id: "50000000-0000-0000-0000-000000000003",
      buildingId: buildingA.id,
      unitId: unitA2.id,
      meterNumber: "M-A-WH-003",
      externalId: "water-hot-003",
      name: "Water Hot Apt 2.2",
      type: "water_hot" as const,
      medium: "water",
      unit: "m3",
      direction: "consumption" as const,
      readingMode: "cumulative" as const
    },
    {
      id: "50000000-0000-0000-0000-000000000004",
      buildingId: buildingA.id,
      unitId: null,
      meterNumber: "M-A-EL-004",
      externalId: "electricity-int-004",
      name: "Electricity Main",
      type: "electricity" as const,
      medium: "electricity",
      unit: "kWh",
      direction: "consumption" as const,
      readingMode: "interval" as const
    },
    {
      id: "50000000-0000-0000-0000-000000000005",
      buildingId: buildingB.id,
      unitId: null,
      meterNumber: "M-B-HEAT-005",
      externalId: "heat-main-005",
      name: "Main Heat B",
      type: "heat" as const,
      medium: "district_heat",
      unit: "kWh",
      direction: "consumption" as const,
      readingMode: "cumulative" as const
    },
    {
      id: "50000000-0000-0000-0000-000000000006",
      buildingId: buildingB.id,
      unitId: unitB1.id,
      meterNumber: "M-B-GAS-006",
      externalId: "gas-main-006",
      name: "Gas Shop G1",
      type: "gas" as const,
      medium: "gas",
      unit: "kWh",
      direction: "consumption" as const,
      readingMode: "cumulative" as const
    },
    {
      id: "50000000-0000-0000-0000-000000000007",
      buildingId: buildingB.id,
      unitId: null,
      meterNumber: "M-B-WC-007",
      externalId: "water-cold-007",
      name: "Water Cold Main B",
      type: "water_cold" as const,
      medium: "water",
      unit: "m3",
      direction: "consumption" as const,
      readingMode: "interval" as const
    }
  ];

  const meters = [];
  for (const meterDef of meterDefs) {
    const meter = await prisma.meter.upsert({
      where: { id: meterDef.id },
      update: {
        tenantId: tenant.id,
        buildingId: meterDef.buildingId,
        unitId: meterDef.unitId,
        meterNumber: meterDef.meterNumber,
        externalId: meterDef.externalId,
        name: meterDef.name,
        type: meterDef.type,
        medium: meterDef.medium,
        unit: meterDef.unit,
        direction: meterDef.direction,
        readingMode: meterDef.readingMode,
        multiplier: 1,
        installedAt: new Date("2025-01-01T00:00:00Z")
      },
      create: {
        id: meterDef.id,
        tenantId: tenant.id,
        buildingId: meterDef.buildingId,
        unitId: meterDef.unitId,
        meterNumber: meterDef.meterNumber,
        externalId: meterDef.externalId,
        name: meterDef.name,
        type: meterDef.type,
        medium: meterDef.medium,
        unit: meterDef.unit,
        direction: meterDef.direction,
        readingMode: meterDef.readingMode,
        multiplier: 1,
        installedAt: new Date("2025-01-01T00:00:00Z")
      }
    });

    meters.push(meter);
  }

  await prisma.meterReading.deleteMany({ where: { tenantId: tenant.id } });

  const now = new Date();
  const readings: Array<{
    tenantId: string;
    meterId: string;
    gatewayId: string;
    timestamp: Date;
    value: number;
    unit: string;
    qualityFlag: "ok";
    source: "gateway";
  }> = [];

  for (const meter of meters) {
    if (meter.readingMode === "cumulative") {
      let running = meter.type === "water_cold" || meter.type === "water_hot" ? 300 : 10000;
      for (let day = 75; day >= 0; day -= 1) {
        const timestamp = new Date(now);
        timestamp.setUTCDate(now.getUTCDate() - day);
        timestamp.setUTCHours(0, 0, 0, 0);

        running += meter.type.includes("water") ? 1.4 : 58.2;

        readings.push({
          tenantId: tenant.id,
          meterId: meter.id,
          gatewayId: meter.buildingId === buildingA.id ? gatewayA.id : gatewayB.id,
          timestamp,
          value: Number(running.toFixed(3)),
          unit: meter.unit,
          qualityFlag: "ok",
          source: "gateway"
        });
      }
    } else {
      for (let hour = 14 * 24; hour >= 0; hour -= 1) {
        const timestamp = new Date(now.getTime() - hour * 60 * 60 * 1000);
        const wave = Math.sin(hour / 8) * 0.4 + 1.1;
        const value = meter.type === "electricity" ? 4.2 * wave : 0.23 * wave;

        readings.push({
          tenantId: tenant.id,
          meterId: meter.id,
          gatewayId: meter.buildingId === buildingA.id ? gatewayA.id : gatewayB.id,
          timestamp,
          value: Number(value.toFixed(3)),
          unit: meter.unit,
          qualityFlag: "ok",
          source: "gateway"
        });
      }
    }
  }

  await prisma.meterReading.createMany({
    data: readings,
    skipDuplicates: true
  });

  const taxProfile = await prisma.taxProfile.upsert({
    where: { id: "99999999-9999-9999-9999-999999999999" },
    update: {
      tenantId: tenant.id,
      name: "Swiss VAT Standard",
      countryCode: "CH",
      taxHandlingMode: "exclusive",
      vatRate: 0.077,
      validFrom: new Date("2026-01-01T00:00:00Z"),
      validTo: null,
      isDefault: true
    },
    create: {
      id: "99999999-9999-9999-9999-999999999999",
      tenantId: tenant.id,
      name: "Swiss VAT Standard",
      countryCode: "CH",
      taxHandlingMode: "exclusive",
      vatRate: 0.077,
      validFrom: new Date("2026-01-01T00:00:00Z"),
      validTo: null,
      isDefault: true
    }
  });

  const allocationKey = await prisma.tenantAllocationKey.upsert({
    where: { id: "aaaa9999-9999-9999-9999-999999999999" },
    update: {
      tenantId: tenant.id,
      buildingId: buildingA.id,
      name: "Area-based allocation 2026",
      method: "area_sqm",
      isDefault: true,
      validFrom: new Date("2026-01-01T00:00:00Z"),
      validTo: null,
      notes: "Prepared for annual operating cost allocation."
    },
    create: {
      id: "aaaa9999-9999-9999-9999-999999999999",
      tenantId: tenant.id,
      buildingId: buildingA.id,
      name: "Area-based allocation 2026",
      method: "area_sqm",
      isDefault: true,
      validFrom: new Date("2026-01-01T00:00:00Z"),
      validTo: null,
      notes: "Prepared for annual operating cost allocation."
    }
  });

  await prisma.tenantAllocationKeyEntry.deleteMany({
    where: {
      allocationKeyId: allocationKey.id
    }
  });

  await prisma.tenantAllocationKeyEntry.createMany({
    data: [
      {
        tenantId: tenant.id,
        allocationKeyId: allocationKey.id,
        unitId: unitA1.id,
        label: unitA1.name,
        shareValue: 78,
        basisValue: 78
      },
      {
        tenantId: tenant.id,
        allocationKeyId: allocationKey.id,
        unitId: unitA2.id,
        label: unitA2.name,
        shareValue: 92,
        basisValue: 92
      }
    ]
  });

  await prisma.operatingCostComponent.upsert({
    where: { id: "bbbb9999-9999-9999-9999-999999999999" },
    update: {
      tenantId: tenant.id,
      buildingId: buildingA.id,
      name: "Heating base service fee",
      code: "HEAT_BASE_2026",
      componentType: "fixed",
      fixedAmount: 120,
      variableRate: null,
      unit: null,
      currency: "CHF",
      allocationKeyId: allocationKey.id,
      taxProfileId: taxProfile.id,
      validFrom: new Date("2026-01-01T00:00:00Z"),
      validTo: null,
      isActive: true,
      formulaTemplate: "fixed_amount"
    },
    create: {
      id: "bbbb9999-9999-9999-9999-999999999999",
      tenantId: tenant.id,
      buildingId: buildingA.id,
      name: "Heating base service fee",
      code: "HEAT_BASE_2026",
      componentType: "fixed",
      fixedAmount: 120,
      variableRate: null,
      unit: null,
      currency: "CHF",
      allocationKeyId: allocationKey.id,
      taxProfileId: taxProfile.id,
      validFrom: new Date("2026-01-01T00:00:00Z"),
      validTo: null,
      isActive: true,
      formulaTemplate: "fixed_amount"
    }
  });

  const tariff = await prisma.tariff.upsert({
    where: { id: "66666666-6666-6666-6666-666666666666" },
    update: {
      tenantId: tenant.id,
      name: "Heat Tariff 2026",
      meterType: "heat",
      validFrom: new Date("2026-01-01T00:00:00Z"),
      validTo: null,
      pricingModel: "monthly_fixed_plus_usage",
      monthlyBaseFee: 120,
      pricePerUnit: 0.19,
      currency: "CHF",
      taxProfileId: taxProfile.id
    },
    create: {
      id: "66666666-6666-6666-6666-666666666666",
      tenantId: tenant.id,
      name: "Heat Tariff 2026",
      meterType: "heat",
      validFrom: new Date("2026-01-01T00:00:00Z"),
      validTo: null,
      pricingModel: "monthly_fixed_plus_usage",
      monthlyBaseFee: 120,
      pricePerUnit: 0.19,
      currency: "CHF",
      taxProfileId: taxProfile.id
    }
  });

  const billingPeriod = await prisma.billingPeriod.upsert({
    where: { id: "77777777-7777-7777-7777-777777777777" },
    update: {
      tenantId: tenant.id,
      buildingId: buildingA.id,
      name: "February 2026",
      periodStart: new Date("2026-02-01T00:00:00Z"),
      periodEnd: new Date("2026-02-28T23:59:59Z"),
      periodType: "monthly",
      fiscalYear: 2026,
      status: "draft"
    },
    create: {
      id: "77777777-7777-7777-7777-777777777777",
      tenantId: tenant.id,
      buildingId: buildingA.id,
      name: "February 2026",
      periodStart: new Date("2026-02-01T00:00:00Z"),
      periodEnd: new Date("2026-02-28T23:59:59Z"),
      periodType: "monthly",
      fiscalYear: 2026,
      status: "draft"
    }
  });

  await prisma.invoiceDraft.deleteMany({
    where: {
      tenantId: tenant.id,
      billingPeriodId: billingPeriod.id
    }
  });

  const seededDraft = await prisma.invoiceDraft.create({
    data: {
      id: "88888888-8888-8888-8888-888888888888",
      tenantId: tenant.id,
      buildingId: buildingA.id,
      unitId: null,
      billingPeriodId: billingPeriod.id,
      tariffId: tariff.id,
      taxProfileId: taxProfile.id,
      totalConsumption: 12000,
      subtotal: 2400,
      taxRate: 0.077,
      taxHandlingMode: "exclusive",
      taxAmount: 184.8,
      totalAmount: 2584.8,
      currency: "CHF",
      status: "draft",
      warningFlags: [],
      breakdownJson: {
        billingPeriodId: billingPeriod.id,
        billingPeriodName: billingPeriod.name,
        buildingId: buildingA.id,
        unitId: null,
        tariffId: tariff.id,
        currency: "CHF",
        formula: "120 + (12000 * 0.19)",
        items: [
          {
            meterId: "50000000-0000-0000-0000-000000000001",
            meterExternalId: "heat-main-001",
            readingMode: "cumulative",
            unit: "kWh",
            startReading: 14000,
            endReading: 26000,
            consumption: 12000
          }
        ],
        subtotal: 2400,
        taxRate: 0.077,
        taxAmount: 184.8,
        total: 2584.8,
        warnings: []
      }
    }
  });

  await prisma.calculationBreakdownSnapshot.create({
    data: {
      tenantId: tenant.id,
      billingPeriodId: billingPeriod.id,
      invoiceDraftId: seededDraft.id,
      runLabel: "seed_initial_draft",
      exportVersion: 1,
      breakdownJson: seededDraft.breakdownJson ?? {}
    }
  });

  await prisma.apiKey.upsert({
    where: { keyPrefix: "demoapikey" },
    update: {
      tenantId: tenant.id,
      name: "Demo ingestion key",
      keyHash: hashToken("mtr_demoapikey_1234567890abcdef1234567890abcdef"),
      status: "active"
    },
    create: {
      tenantId: tenant.id,
      name: "Demo ingestion key",
      keyPrefix: "demoapikey",
      keyHash: hashToken("mtr_demoapikey_1234567890abcdef1234567890abcdef"),
      status: "active"
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      userId: adminUser.id,
      action: "seed.completed",
      entityType: "tenant",
      entityId: tenant.id,
      payloadJson: {
        buildings: 2,
        meters: meters.length,
        readings: readings.length,
        gateways: 2,
        tariffs: 1,
        billingPeriods: 1,
        invoiceDrafts: 1
      }
    }
  });

  await prisma.billingChangeLog.create({
    data: {
      tenantId: tenant.id,
      userId: adminUser.id,
      sourceModule: "seed",
      action: "billing.baseline_initialized",
      entityType: "tenant",
      entityId: tenant.id,
      reason: "Seed initialized DACH/Swiss-ready baseline structures",
      changeSetJson: {
        taxProfiles: 1,
        allocationKeys: 1,
        operatingCostComponents: 1
      }
    }
  });

  // eslint-disable-next-line no-console
  console.log("Seed completed:", {
    tenantSlug: tenant.slug,
    adminEmail,
    adminPassword,
    gatewayTokenA,
    gatewayTokenB,
    apiKey: "mtr_demoapikey_1234567890abcdef1234567890abcdef"
  });
}

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error("Seed failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });
