import { describe, expect, it } from "vitest";
import { evaluateAdoptionGate } from "../src/contract-migration";

const ready = {
  status: "tested" as const,
  contractVersionPinned: true,
  adapterReviewed: true,
  compatibilityTestsPassed: true,
  regressionTestsPassed: true,
  tenantScopeVerified: true,
  authorizationBoundaryVerified: true,
  rollbackPlanPresent: true,
  evidenceReference: "report://migration-wave-1",
};

describe("Build 45 contract migration gate", () => {
  it("blocks migration when tenant scope is not verified", () => {
    const result = evaluateAdoptionGate({ ...ready, tenantScopeVerified: false });
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("TENANT_SCOPE_NOT_VERIFIED");
  });

  it("blocks migration without evidence", () => {
    const result = evaluateAdoptionGate({ ...ready, evidenceReference: undefined });
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("MIGRATION_EVIDENCE_REQUIRED");
  });

  it("allows a tested adapter when all gates pass", () => {
    const result = evaluateAdoptionGate(ready);
    expect(result.allowed).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("blocks an item that is only discovered", () => {
    const result = evaluateAdoptionGate({ ...ready, status: "discovered" });
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("MIGRATION_NOT_READY");
  });
});
