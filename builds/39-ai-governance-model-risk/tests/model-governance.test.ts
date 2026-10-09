import { describe, expect, it } from "vitest";
import { authorizeDeployment, evaluateDeploymentGate } from "../src/model-governance";

const approvedGate = {
  useCaseRisk: "moderate" as const,
  evaluationPassed: true,
  evaluationMatchesConfiguration: true,
  humanReviewApproved: true,
  securityReviewApproved: true,
  incidentHoldActive: false,
};

describe("Build 39 AI governance", () => {
  it("blocks unassessed use cases", () => {
    const result = evaluateDeploymentGate({
      ...approvedGate,
      useCaseRisk: "unassessed",
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("RISK_CLASSIFICATION_REQUIRED");
  });

  it("blocks mismatched evaluation configuration", () => {
    const result = evaluateDeploymentGate({
      ...approvedGate,
      evaluationMatchesConfiguration: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("EVALUATION_CONFIGURATION_MISMATCH");
  });

  it("blocks deployment during an incident hold", () => {
    const result = evaluateDeploymentGate({
      ...approvedGate,
      incidentHoldActive: true,
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("INCIDENT_HOLD_ACTIVE");
  });

  it("requires release authority even when all governance checks pass", async () => {
    const result = await authorizeDeployment(
      {
        recordEvent: async () => {},
        verifyReleaseAuthority: async () => false,
        deployApprovedVersion: async () => {},
      },
      approvedGate,
    );

    expect(result.deployed).toBe(false);
    expect(result.blockers).toContain("RELEASE_AUTHORITY_REQUIRED");
  });

  it("deploys only after all gates and release authority pass", async () => {
    let deployed = false;
    const result = await authorizeDeployment(
      {
        recordEvent: async () => {},
        verifyReleaseAuthority: async () => true,
        deployApprovedVersion: async () => {
          deployed = true;
        },
      },
      approvedGate,
    );

    expect(result.deployed).toBe(true);
    expect(deployed).toBe(true);
  });
});
