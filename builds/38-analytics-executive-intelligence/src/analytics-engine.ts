export interface MetricInput {
  key: string;
  value: number | null;
  weight?: number;
  observedAt?: string;
  maxAgeSeconds?: number;
}

export interface MetricResult {
  status: "valid" | "insufficient_data" | "stale" | "invalid";
  value: number | null;
  missing: string[];
  warnings: string[];
}

export function calculateWeightedMetric(inputs: MetricInput[], nowMs = Date.now()): MetricResult {
  if (inputs.length === 0) {
    return { status: "insufficient_data", value: null, missing: ["NO_INPUTS"], warnings: [] };
  }

  const missing = inputs.filter((input) => input.value === null).map((input) => input.key);
  if (missing.length > 0) {
    return { status: "insufficient_data", value: null, missing, warnings: [] };
  }

  for (const input of inputs) {
    if (
      !Number.isFinite(input.value) ||
      !Number.isFinite(input.weight ?? 1) ||
      (input.weight ?? 1) < 0
    ) {
      return {
        status: "invalid",
        value: null,
        missing: [],
        warnings: ["INVALID_METRIC_INPUT"],
      };
    }
  }

  const stale = inputs.filter((input) => {
    if (!input.observedAt || input.maxAgeSeconds === undefined) return false;
    const timestamp = Date.parse(input.observedAt);
    return !Number.isFinite(timestamp) || nowMs - timestamp > input.maxAgeSeconds * 1000;
  });

  if (stale.length > 0) {
    return {
      status: "stale",
      value: null,
      missing: [],
      warnings: stale.map((input) => `STALE_SOURCE:${input.key}`),
    };
  }

  const totalWeight = inputs.reduce((sum, input) => sum + (input.weight ?? 1), 0);
  if (totalWeight <= 0) {
    return { status: "invalid", value: null, missing: [], warnings: ["INVALID_TOTAL_WEIGHT"] };
  }

  const weightedSum = inputs.reduce(
    (sum, input) => sum + (input.value as number) * (input.weight ?? 1),
    0,
  );

  return {
    status: "valid",
    value: Math.round((weightedSum / totalWeight) * 10000) / 10000,
    missing: [],
    warnings: [],
  };
}

export function classifyThreshold(
  value: number | null,
  warningThreshold: number,
  criticalThreshold: number,
): "unknown" | "normal" | "warning" | "critical" {
  if (value === null || !Number.isFinite(value)) return "unknown";
  if (value >= criticalThreshold) return "critical";
  if (value >= warningThreshold) return "warning";
  return "normal";
}
