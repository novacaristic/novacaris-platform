export type RunStatus = "passed" | "failed" | "blocked" | "not_run";

export interface PilotRunEvidence {
  runId: string;
  sourceRevision: string;
  environment: string;
  command: string;
  startedAt: string;
  completedAt?: string;
  status: RunStatus;
  passed: number;
  failed: number;
  skipped: number;
  reportReference?: string;
  limitations: string[];
}

export function validateRunEvidence(evidence: PilotRunEvidence): {
  valid: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];
  if (!evidence.runId.trim()) blockers.push("RUN_ID_REQUIRED");
  if (!evidence.sourceRevision.trim()) blockers.push("SOURCE_REVISION_REQUIRED");
  if (!evidence.environment.trim()) blockers.push("ENVIRONMENT_REQUIRED");
  if (!evidence.command.trim()) blockers.push("COMMAND_REQUIRED");
  if (!evidence.startedAt.trim()) blockers.push("START_TIME_REQUIRED");

  if (evidence.status === "passed") {
    if (!evidence.completedAt) blockers.push("COMPLETION_TIME_REQUIRED");
    if (evidence.failed !== 0) blockers.push("FAILED_TESTS_PRESENT");
    if (evidence.passed < 1) blockers.push("PASSING_TEST_EVIDENCE_REQUIRED");
    if (!evidence.reportReference) blockers.push("REPORT_REFERENCE_REQUIRED");
  }
  if (evidence.status === "not_run" && evidence.completedAt) {
    blockers.push("NOT_RUN_CANNOT_HAVE_COMPLETION_TIME");
  }
  if (evidence.passed < 0 || evidence.failed < 0 || evidence.skipped < 0) {
    blockers.push("TEST_COUNTS_CANNOT_BE_NEGATIVE");
  }
  return { valid: blockers.length === 0, blockers };
}

export function classifyProcessResult(exitCode: number | null): RunStatus {
  if (exitCode === null) return "blocked";
  return exitCode === 0 ? "passed" : "failed";
}
