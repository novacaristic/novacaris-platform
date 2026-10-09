import { describe, expect, it } from "vitest";
import { summarizeAudit, validateEvidenceStatus } from "../src/audit-engine";

describe("Build 43 audit engine", () => {
  it("rejects tested status without evidence", () => {
    const result = validateEvidenceStatus({
      buildKey: "build-42", status: "tested", sourceRevision: "abc123",
      environment: "ci", result: "passed",
    });
    expect(result.valid).toBe(false);
    expect(result.blockers).toContain("TEST_OR_RUNTIME_EVIDENCE_REQUIRED");
  });

  it("requires staging environment for staging verification", () => {
    const result = validateEvidenceStatus({
      buildKey: "build-41", status: "staging_verified",
      evidenceReference: "report://staging", sourceRevision: "abc123",
      environment: "development", result: "passed",
    });
    expect(result.valid).toBe(false);
    expect(result.blockers).toContain("STAGING_ENVIRONMENT_REQUIRED");
  });

  it("blocks release while critical findings remain", () => {
    const summary = summarizeAudit(
      [{ buildKey: "build-01", status: "tested", evidenceReference: "report://test",
        sourceRevision: "abc123", environment: "ci", result: "passed" }],
      [{ key: "SEC-1", severity: "critical", status: "open" }],
    );
    expect(summary.releaseBlocked).toBe(true);
    expect(summary.openCriticalFindings).toBe(1);
  });

  it("does not count merely committed builds as verified", () => {
    const summary = summarizeAudit([{ buildKey: "build-42", status: "committed" }], []);
    expect(summary.evidencedTestedOrHigher).toBe(0);
    expect(summary.unverifiedBuilds).toContain("build-42");
  });
});