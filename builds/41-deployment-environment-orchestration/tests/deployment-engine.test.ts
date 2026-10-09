import { describe, expect, it } from "vitest";
import { evaluateDeploymentGate, runApprovedDeployment } from "../src/deployment-engine";

const validGate = {
  environment: "staging" as const,
  sourceRevision: "abc123",
  artifactDigest: "sha256:example",
  requiredChecks: [{ key: "unit-tests", status: "passed" as const, evidenceReference: "report://unit-tests" }],
  migrationPlanApproved: true,
  rollbackPlanPresent: true,
  humanApprovalPresent: false,
  secretReferencesValidated: true,
};

describe("Build 41 deployment engine", () => {
  it("blocks production without human approval", () => {
    const result = evaluateDeploymentGate({
      ...validGate,
      environment: "production",
      humanApprovalPresent: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("PRODUCTION_APPROVAL_REQUIRED");
  });

  it("blocks required checks without evidence", () => {
    const result = evaluateDeploymentGate({
      ...validGate,
      requiredChecks: [{ key: "unit-tests", status: "passed" }],
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("CHECK_EVIDENCE_REQUIRED:unit-tests");
  });

  it("does not report deployment verified when postchecks fail", async () => {
    let executed = false;
    const result = await runApprovedDeployment(
      {
        recordEvent: async () => {},
        executeApprovedDeployment: async () => { executed = true; },
        verifyPostDeployment: async () => ({ healthy: false }),
      },
      validGate,
    );

    expect(executed).toBe(true);
    expect(result.status).toBe("verification_failed");
  });

  it("reports deployed only when postchecks are healthy and evidenced", async () => {
    const result = await runApprovedDeployment(
      {
        recordEvent: async () => {},
        executeApprovedDeployment: async () => {},
        verifyPostDeployment: async () => ({ healthy: true, evidenceReference: "report://smoke" }),
      },
      validGate,
    );

    expect(result.status).toBe("deployed");
  });
});
