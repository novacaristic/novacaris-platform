export type CheckStatus = "passed" | "failed" | "blocked" | "skipped";

export interface VerificationCheck {
  key: string;
  status: CheckStatus;
  required: boolean;
  severity: "info" | "low" | "medium" | "high" | "critical";
  evidenceReference?: string;
}

export interface ReleaseGateInput {
  checks: VerificationCheck[];
  unresolvedCriticalFindings: number;
  requiredEnvironmentEvidencePresent: boolean;
  sourceRevision: string;
}

export function evaluateReleaseReadiness(
  input: ReleaseGateInput,
): { decision: "ready" | "ready_with_conditions" | "blocked"; blockers: string[]; warnings: string[] } {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!input.sourceRevision.trim()) blockers.push("SOURCE_REVISION_REQUIRED");
  if (!input.requiredEnvironmentEvidencePresent) blockers.push("ENVIRONMENT_EVIDENCE_REQUIRED");
  if (input.unresolvedCriticalFindings > 0) blockers.push("UNRESOLVED_CRITICAL_FINDINGS");

  for (const check of input.checks) {
    if (check.required && check.status !== "passed") {
      blockers.push(`REQUIRED_CHECK_NOT_PASSED:${check.key}`);
    } else if (!check.required && check.status !== "passed") {
      warnings.push(`OPTIONAL_CHECK_NOT_PASSED:${check.key}`);
    }

    if (check.status === "passed" && !check.evidenceReference) {
      blockers.push(`PASS_WITHOUT_EVIDENCE:${check.key}`);
    }
  }

  if (blockers.length > 0) return { decision: "blocked", blockers, warnings };
  if (warnings.length > 0) return { decision: "ready_with_conditions", blockers, warnings };
  return { decision: "ready", blockers, warnings };
}

export interface VerificationDependencies {
  recordEvent(type: string, details: Record<string, unknown>): Promise<void>;
  runCheck(check: VerificationCheck): Promise<VerificationCheck>;
}

export async function executeVerificationChecks(
  deps: VerificationDependencies,
  checks: VerificationCheck[],
): Promise<VerificationCheck[]> {
  const results: VerificationCheck[] = [];

  for (const check of checks) {
    try {
      results.push(await deps.runCheck(check));
    } catch {
      results.push({
        ...check,
        status: "failed",
        evidenceReference: undefined,
      });
      await deps.recordEvent("platform_verification.check_failed", {
        checkKey: check.key,
        reason: "CHECK_EXECUTION_ERROR",
      });
    }
  }

  return results;
}
