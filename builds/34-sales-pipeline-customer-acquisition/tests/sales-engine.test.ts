import { describe, expect, it } from "vitest";
import {
  scoreQualification,
  convertWonOpportunity,
} from "../src/sales-engine";

describe("Build 34 sales engine", () => {
  it("scores only when all qualification inputs are known", () => {
    const result = scoreQualification([
      { key: "need", weight: 50, satisfied: true },
      { key: "timeline", weight: 50, satisfied: null },
    ]);

    expect(result.score).toBeNull();
    expect(result.missing).toContain("timeline");
  });

  it("computes an explainable weighted qualification score", () => {
    const result = scoreQualification([
      { key: "need", weight: 60, satisfied: true },
      { key: "fit", weight: 40, satisfied: false },
    ]);

    expect(result.score).toBe(60);
  });

  it("blocks conversion when the opportunity is not won", async () => {
    const result = await convertWonOpportunity(
      {
        recordEvent: async () => {},
        verifyProposalApproved: async () => true,
        createConsultingEngagement: async () => "engagement-1",
      },
      "opportunity-1",
      "proposal",
    );

    expect(result.converted).toBe(false);
    expect(result.reason).toBe("OPPORTUNITY_NOT_WON");
  });

  it("requires approved proposal before conversion", async () => {
    const result = await convertWonOpportunity(
      {
        recordEvent: async () => {},
        verifyProposalApproved: async () => false,
        createConsultingEngagement: async () => "engagement-1",
      },
      "opportunity-1",
      "closed_won",
    );

    expect(result.converted).toBe(false);
    expect(result.reason).toBe("APPROVED_PROPOSAL_REQUIRED");
  });

  it("converts an approved won opportunity into an engagement", async () => {
    const result = await convertWonOpportunity(
      {
        recordEvent: async () => {},
        verifyProposalApproved: async () => true,
        createConsultingEngagement: async () => "engagement-1",
      },
      "opportunity-1",
      "closed_won",
    );

    expect(result.converted).toBe(true);
    expect(result.engagementId).toBe("engagement-1");
  });
});
