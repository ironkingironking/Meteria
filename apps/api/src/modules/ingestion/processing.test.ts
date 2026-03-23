import test from "node:test";
import assert from "node:assert/strict";
import { parseIngestionPayload, validateGatewaySerialMatch } from "./processing";

test("parseIngestionPayload parses single payload", () => {
  const parsed = parseIngestionPayload({
    meter_external_id: "heat-main-001",
    timestamp: "2026-03-11T12:00:00Z",
    value: 14234.45,
    unit: "kWh",
    quality_flag: "ok"
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) {
    return;
  }

  assert.equal(parsed.readings.length, 1);
  assert.equal(parsed.readings[0].meter_external_id, "heat-main-001");
  assert.equal(parsed.readings[0].unit, "kWh");
});

test("parseIngestionPayload rejects invalid payload", () => {
  const parsed = parseIngestionPayload({
    meter_external_id: "",
    value: "not-a-number"
  });

  assert.equal(parsed.success, false);
  if (parsed.success) {
    return;
  }

  assert.equal(parsed.error.message, "Invalid ingestion payload");
});

test("validateGatewaySerialMatch detects mismatch", () => {
  const result = validateGatewaySerialMatch("rpi5-lu-001", "rpi5-lu-002");

  assert.equal(result.valid, false);
  if (result.valid) {
    return;
  }

  assert.match(result.message, /does not match/);
});

