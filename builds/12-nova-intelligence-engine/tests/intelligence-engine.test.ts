import { describe, expect, it } from "vitest";
import { runIntelligence } from "../src/intelligence-engine";

describe("Build 12 intelligence engine", () => {
  const context = {
    tenantId: "tenant-1",
    userId: "user-1",
    purpose: "readiness-investigation",
  };

  it("fails safely when authorized evidence is unavailable", async () => {
    let recorded = false;

    const result = await runIntelligence({
      recordRun: async () => "run-1",
      retrieve: async () => [],
      reason: async () => {
        throw new Error("reasoning should not run");
      },
      recordOutput: async () => {
        recorded = true;
      },
    }, context);

    expect(result.output.content.status).toBe("insufficient_context");
    expect(result.output.confidence).toBe(0);
    expect(recorded).toBe(true);
  });

  it("requires evidence for a normal reasoning run", async () => {
    const result = await runIntelligence({
      recordRun: async () => "run-2",
      retrieve: async () => [
        { id: "e-1", authority: "internal_verified", relevance: 0.95 },
      ],
      reason: async (_context, evidence) => ({
        type: "recommendation",
        content: { recommendation: "request updated evidence" },
        confidence: evidence[0].relevance,
        riskLevel: "medium",
        requiresReview: true,
        evidence,
      }),
      recordOutput: async () => {},
    }, context);

    expect(result.runId).toBe("run-2");
    expect(result.output.evidence).toHaveLength(1);
    expect(result.output.requiresReview).toBe(true);
  });
});
