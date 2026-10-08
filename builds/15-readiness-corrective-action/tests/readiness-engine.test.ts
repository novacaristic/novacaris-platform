import { describe, expect, it } from "vitest";
import { calculateReadiness } from "../src/readiness-engine";

describe("Build 15 readiness engine", () => {
  it("calculates READY when score is high and no critical override exists", () => {
    const result = calculateReadiness({
      evidenceCoverage: 100,
      verifiedCompliance: 100,
      criticalGapPenalty: 100,
      correctiveActionCompletion: 100,
      criticalGaps: 0,
      expiredCriticalEvidence: 0,
    });

    expect(result.status).toBe("READY");
    expect(result.score).toBe(100);
  });

  it("fails closed on an unresolved critical gap", () => {
    const result = calculateReadiness({
      evidenceCoverage: 100,
      verifiedCompliance: 100,
      criticalGapPenalty: 100,
      correctiveActionCompletion: 100,
      criticalGaps: 1,
      expiredCriticalEvidence: 0,
    });

    expect(result.status).toBe("NOT READY");
  });

  it("fails closed on expired critical evidence", () => {
    const result = calculateReadiness({
      evidenceCoverage: 100,
      verifiedCompliance: 100,
      criticalGapPenalty: 100,
      correctiveActionCompletion: 100,
      criticalGaps: 0,
      expiredCriticalEvidence: 1,
    });

    expect(result.status).toBe("NOT READY");
  });
});
