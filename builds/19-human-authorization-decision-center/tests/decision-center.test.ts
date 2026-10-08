import { describe, expect, it } from "vitest";
import { submitDecision } from "../src/decision-center";

describe("Build 19 decision center", () => {
  it("issues authorization only after policy approval", async () => {
    let issued = false;

    const result = await submitDecision(
      {
        evaluatePolicy: async () => ({
          allowed: true,
          requiredApprovers: 1,
        }),
        recordDecision: async () => "decision-1",
        issueAuthorization: async () => {
          issued = true;
          return "auth-1";
        },
      },
      {
        tenantId: "tenant-1",
        userId: "user-1",
        decisionRequestId: "request-1",
      },
      "approve",
      "Evidence and policy requirements were reviewed.",
    );

    expect(result.decisionId).toBe("decision-1");
    expect(result.authorizationId).toBe("auth-1");
    expect(issued).toBe(true);
  });

  it("fails closed when policy denies the decision", async () => {
    await expect(
      submitDecision(
        {
          evaluatePolicy: async () => ({
            allowed: false,
            requiredApprovers: 2,
            reason: "Reviewer lacks required authority.",
          }),
          recordDecision: async () => "should-not-record",
          issueAuthorization: async () => "should-not-issue",
        },
        {
          tenantId: "tenant-1",
          userId: "user-1",
          decisionRequestId: "request-2",
        },
        "approve",
        "Attempted approval.",
      ),
    ).rejects.toThrow("Reviewer lacks required authority.");
  });
});
