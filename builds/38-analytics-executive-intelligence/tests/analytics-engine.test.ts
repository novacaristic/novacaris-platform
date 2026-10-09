import { describe, expect, it } from "vitest";
import { calculateWeightedMetric, classifyThreshold } from "../src/analytics-engine";

describe("Build 38 analytics engine", () => {
  it("does not turn missing inputs into zero", () => {
    const result = calculateWeightedMetric([
      { key: "revenue", value: 100 },
      { key: "collections", value: null },
    ]);

    expect(result.status).toBe("insufficient_data");
    expect(result.value).toBeNull();
    expect(result.missing).toContain("collections");
  });

  it("calculates weighted values from valid inputs", () => {
    const result = calculateWeightedMetric([
      { key: "adoption", value: 80, weight: 3 },
      { key: "support", value: 60, weight: 1 },
    ]);

    expect(result.status).toBe("valid");
    expect(result.value).toBe(75);
  });

  it("marks stale inputs rather than presenting them as current", () => {
    const result = calculateWeightedMetric(
      [{ key: "runtime", value: 99, observedAt: "2020-01-01T00:00:00Z", maxAgeSeconds: 60 }],
      Date.parse("2020-01-01T00:02:00Z"),
    );

    expect(result.status).toBe("stale");
    expect(result.value).toBeNull();
  });

  it("classifies missing values as unknown", () => {
    expect(classifyThreshold(null, 50, 80)).toBe("unknown");
    expect(classifyThreshold(55, 50, 80)).toBe("warning");
    expect(classifyThreshold(90, 50, 80)).toBe("critical");
  });
});
