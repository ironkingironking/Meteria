import { z } from "zod";

export const MAX_INGESTION_BATCH_SIZE = 1000;

export const readingSchema = z.object({
  meter_external_id: z.string().min(1),
  timestamp: z.coerce.date(),
  value: z.coerce.number(),
  raw_value: z.string().optional(),
  unit: z.string().min(1),
  quality_flag: z.enum(["ok", "estimated", "suspect", "missing"]).default("ok")
});

const singlePayloadSchema = readingSchema;

const batchPayloadSchema = (maxBatchSize: number) =>
  z.object({
    gateway_serial: z.string().min(3).optional(),
    readings: z.array(readingSchema).min(1).max(maxBatchSize)
  });

export type NormalizedReading = z.infer<typeof readingSchema>;

export type ParsedIngestionPayload =
  | {
      success: true;
      readings: NormalizedReading[];
      gatewaySerial?: string;
    }
  | {
      success: false;
      error: {
        message: string;
        details: {
          single: ReturnType<z.ZodError["flatten"]>;
          batch: ReturnType<z.ZodError["flatten"]>;
        };
      };
    };

export function parseIngestionPayload(
  payload: unknown,
  maxBatchSize = MAX_INGESTION_BATCH_SIZE
): ParsedIngestionPayload {
  const singleParse = singlePayloadSchema.safeParse(payload);
  const batchParse = batchPayloadSchema(maxBatchSize).safeParse(payload);

  if (batchParse.success) {
    return {
      success: true,
      readings: batchParse.data.readings,
      gatewaySerial: batchParse.data.gateway_serial
    };
  }

  if (singleParse.success) {
    return {
      success: true,
      readings: [singleParse.data]
    };
  }

  return {
    success: false,
    error: {
      message: "Invalid ingestion payload",
      details: {
        single: singleParse.error.flatten(),
        batch: batchParse.error.flatten()
      }
    }
  };
}

export function validateGatewaySerialMatch(
  expectedGatewaySerial: string | null | undefined,
  payloadGatewaySerial?: string
): { valid: true } | { valid: false; message: string } {
  if (!payloadGatewaySerial || !expectedGatewaySerial) {
    return { valid: true };
  }

  if (expectedGatewaySerial !== payloadGatewaySerial) {
    return {
      valid: false,
      message: "gateway_serial does not match authenticated gateway token"
    };
  }

  return { valid: true };
}

