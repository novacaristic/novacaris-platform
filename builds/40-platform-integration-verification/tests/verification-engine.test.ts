import { describe, expect, it } from "vitest";
import { evaluateReleaseReadiness, executeVerificationChecks } from "../src/verification-engine";

describe("Build 40 verification engine", () => {
  it("blocks release when a required check fails", () => {
    const result = evaluateReleaseReadiness({
      checks: [{
        key: "tenant-isolation",
        status: "failed",
        required: true,
        severity: "critical",
      }],
      unresolvedCriticalFindings: 0,
      requiredEnvironmentEvidencePresent: true,
      sourceRevision: "abc123",
    });

    expect(result.decision).toBe("blocked");
    expect(result.blockers).toContain("REQUIRED_CHECK_NOT_PASSED:tenant-isolation");
  });

  it("blocks a claimed pass without evidence", () => {
    const result = evaluateReleaseReadiness({
      checks: [{
        key: "migration",
        status: "passed",
        required: true,
        severity: "high",
      }],
      unresolvedCriticalFindings: 0,
      requiredEnvironmentEvidencePresent: true,
      sourceRevision: "abc123",
    });

    expect(result.decision).toBe("blocked");
    expect(result.blockers).toContain("PASS_WITHOUT_EVIDENCE:migration");
  });

  it("allows conditional readiness for optional failures", () => {
    const result = evaluateReleaseReadiness({
      checks: [{
        key: "optional-dashboard",
        status: "failed",
        required: false,
        severity: "low",
      }],
      unresolvedCriticalFindings: 0,
      requiredEnvironmentEvidencePresent: true,
      sourceRevision: "abc123",
    });

    expect(result.decision).toBe("ready_with_conditions");
  });

  it("blocks release when critical findings remain", () => {
    const result = evaluateReleaseReadiness({
      checks: [],
      unresolvedCriticalFindings: 1,
      requiredEnvironmentEvidencePresent: true,
      sourceRevision: "abc123",
    });

    expect(result.decision).toBe("blocked");
  });

  it("converts thrown checks into explicit failed results", async () => {
    const results = await executeVerificationChecks(
      { runCheck: async () => { throw new Error("runner down"); }, recordEvent: async () => {} },
      [{ key: "api-contract", status: "blocked", required: true, severity: "high" }],
    );

    expect(results[0].status).toBe("failed");
    expect(results[0].evidenceReference).toBeUndefined();
  });
});
