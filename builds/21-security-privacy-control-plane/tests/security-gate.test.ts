import { describe, expect, it } from "vitest";
import { securityGate } from "../src/security-gate";

describe("Build 21 security gate", () => {
  const context = {
    tenantId: "tenant-1",
    userId: "user-1",
    resourceType: "patient",
    resourceId: "patient-1",
    purpose: "authorized-care-workflow",
  };

  it("allows access when every security check passes", async () => {
    const decisions: string[] = [];

    const allowed = await securityGate(
      {
        isAuthenticated: async () => true,
        hasScope: async () => true,
        hasPrivacyHold: async () => false,
        policyAllows: async () => true,
        recordAccessDecision: async (_ctx, decision, reason) => {
          decisions.push(decision + ":" + reason);
        },
      },
      context,
    );

    expect(allowed).toBe(true);
    expect(decisions[0]).toBe("allow:SECURITY_POLICY_PASSED");
  });

  it("fails closed on Privacy Hold", async () => {
    const allowed = await securityGate(
      {
        isAuthenticated: async () => true,
        hasScope: async () => true,
        hasPrivacyHold: async () => true,
        policyAllows: async () => true,
        recordAccessDecision: async () => {},
      },
      context,
    );

    expect(allowed).toBe(false);
  });

  it("fails closed when scope is missing", async () => {
    const allowed = await securityGate(
      {
        isAuthenticated: async () => true,
        hasScope: async () => false,
        hasPrivacyHold: async () => false,
        policyAllows: async () => true,
        recordAccessDecision: async () => {},
      },
      context,
    );

    expect(allowed).toBe(false);
  });
});
