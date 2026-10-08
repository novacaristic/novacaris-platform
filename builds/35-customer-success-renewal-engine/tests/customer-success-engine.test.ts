import { describe, expect, it } from "vitest";
import { calculateHealth, prepareRenewal } from "../src/customer-success-engine";

describe("Build 35 customer success engine", () => {
  it("returns unknown when health data is missing", () => {
    const result = calculateHealth([
      { key: "adoption", weight: 50, value: 90 },
      { key: "feedback", weight: 50, value: null },
    ]);

    expect(result.score).toBeNull();
    expect(result.status).toBe("unknown");
    expect(result.missing).toContain("feedback");
  });

  it("calculates a weighted health score", () => {
    const result = calculateHealth([
      { key: "adoption", weight: 70, value: 90 },
      { key: "support", weight: 30, value: 60 },
    ]);

    expect(result.score).toBe(81);
    expect(result.status).toBe("healthy");
  });

  it("blocks commercial handoff without authority", async () => {
    const result = await prepareRenewal(
      {
        recordEvent: async () => {},
        verifyCommercialAuthority: async () => false,
        createSalesOpportunity: async () => "opportunity-1",
      },
      "account-1",
      "renewal",
    );

    expect(result.prepared).toBe(false);
    expect(result.reason).toBe("COMMERCIAL_AUTHORITY_REQUIRED");
  });

  it("creates a traceable sales opportunity when authorized", async () => {
    const result = await prepareRenewal(
      {
        recordEvent: async () => {},
        verifyCommercialAuthority: async () => true,
        createSalesOpportunity: async () => "opportunity-1",
      },
      "account-1",
      "expansion",
    );

    expect(result.prepared).toBe(true);
    expect(result.opportunityId).toBe("opportunity-1");
  });
});
