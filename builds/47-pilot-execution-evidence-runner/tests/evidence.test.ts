import { describe, expect, it } from "vitest";
import { classifyProcessResult, validateRunEvidence } from "../src/evidence";

const passedRun = {
  runId: "run-001",
  sourceRevision: "0123456789abcdef0123456789abcdef01234567",
  environment: "ci",
  command: "npm run test:pilot",
  startedAt: "2026-10-08T12:00:00.000Z",
  completedAt: "2026-10-08T12:00:02.000Z",
  status: "passed" as const,
  passed: 5,
  failed: 0,
  skipped: 0,
  reportReference: "artifact://pilot-test-report",
  limitations: ["Synthetic adapter only"],
};

describe("Build 47 evidence validation", () => {
  it("accepts complete passed-run evidence", () => {
    expect(validateRunEvidence(passedRun).valid).toBe(true);
  });

  it("rejects passed status without report evidence", () => {
    const result = validateRunEvidence({ ...passedRun, reportReference: undefined });
    expect(result.valid).toBe(false);
    expect(result.blockers).toContain("REPORT_REFERENCE_REQUIRED");
  });

  it("distinguishes blocked execution from failed tests", () => {
    expect(classifyProcessResult(null)).toBe("blocked");
    expect(classifyProcessResult(1)).toBe("failed");
    expect(classifyProcessResult(0)).toBe("passed");
  });

  it("rejects negative counts", () => {
    const result = validateRunEvidence({ ...passedRun, passed: -1 });
    expect(result.valid).toBe(false);
    expect(result.blockers).toContain("TEST_COUNTS_CANNOT_BE_NEGATIVE");
  });

  it("rejects passed evidence that contains failed tests", () => {
    const result = validateRunEvidence({ ...passedRun, failed: 1 });
    expect(result.valid).toBe(false);
    expect(result.blockers).toContain("FAILED_TESTS_PRESENT");
  });

  it("rejects passed evidence without completion time", () => {
    const result = validateRunEvidence({ ...passedRun, completedAt: undefined });
    expect(result.valid).toBe(false);
    expect(result.blockers).toContain("COMPLETION_TIME_REQUIRED");
  });

  it("rejects empty identity and command fields", () => {
    const result = validateRunEvidence({ ...passedRun, runId: " ", command: "" });
    expect(result.valid).toBe(false);
    expect(result.blockers).toContain("RUN_ID_REQUIRED");
    expect(result.blockers).toContain("COMMAND_REQUIRED");
  });
});
