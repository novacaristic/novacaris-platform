import { describe, expect, it } from "vitest";
import { assessOpportunity } from "../src/funding-engine";

describe("Build 16 funding engine", () => {
  it("prioritizes a strong opportunity", () => {
    const result = assessOpportunity({
      eligibilityConfidence: 95,
      readinessScore: 92,
      evidenceCompleteness: 96,
      strategicFit: 90,
      deadlineFeasibility: 88,
    });

    expect(result.status).toBe("PRIORITIZE");
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it("recommends preparation when readiness is weak", () => {
    const result = assessOpportunity({
      eligibilityConfidence: 70,
      readinessScore: 45,
      evidenceCompleteness: 50,
      strategicFit: 85,
      deadlineFeasibility: 80,
    });

    expect(result.status).toBe("PREPARE");
  });
});
