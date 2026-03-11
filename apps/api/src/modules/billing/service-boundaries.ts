import {
  BillingComputationPorts,
  createDefaultBillingComputationPorts
} from "@meteria/billing-engine";

export const buildBillingComputationPorts = (): BillingComputationPorts => {
  // TODO(DACH/CH): replace no-op ports with jurisdiction-aware implementations.
  // Keep this composition root as the swap point for:
  // - allocation key strategies
  // - operating cost allocation rules
  // - tax policy engines
  // - reading correction interpretation
  // - meter replacement boundary logic
  return createDefaultBillingComputationPorts();
};
