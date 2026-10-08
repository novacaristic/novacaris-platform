import { describe, expect, it } from "vitest";
import {
  evaluateEngagementClosure,
  closeEngagement,
} from "../src/consultancy-engine";

describe("Build 33 consultancy engine", () => {
  it("blocks closure when a required deliverable is not accepted", async () => {
    const result = await evaluateEngagementClosure(
      {
        recordEvent: async () => {},
        verifyCommercialApproval: async () => true,
        verifyRequiredDeliverables: async () => [],
        closeEngagement: async () => {},
      },
      [{ key: "readiness_report", required: true, status: "submitted" }],
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain(
      "DELIVERABLE_NOT_ACCEPTED:readiness_report",
    );
  });

  it("blocks closure without commercial closeout approval", async () => {
    const result = await evaluateEngagementClosure(
      {
        recordEvent: async () => {},
        verifyCommercialApproval: async () => false,
        verifyRequiredDeliverables: async () => [],
        closeEngagement: async () => {},
      },
      [{ key: "final_packet", required: true, status: "accepted" }],
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("COMMERCIAL_CLOSEOUT_NOT_APPROVED");
  });

  it("closes an engagement only when all gates pass", async () => {
    let closed = false;

    await closeEngagement(
      {
        recordEvent: async () => {},
        verifyCommercialApproval: async () => true,
        verifyRequiredDeliverables: async () => [],
        closeEngagement: async () => {
          closed = true;
        },
      },
      [{ key: "final_packet", required: true, status: "accepted" }],
    );

    expect(closed).toBe(true);
  });
});
