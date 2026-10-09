export type Environment = "development" | "staging" | "production";

export interface DeploymentGate {
  environment: Environment;
  sourceRevision: string;
  artifactDigest: string;
  requiredChecks: Array<{
    key: string;
    status: "passed" | "failed" | "pending" | "skipped";
    evidenceReference?: string;
  }>;
  migrationPlanApproved: boolean;
  rollbackPlanPresent: boolean;
  humanApprovalPresent: boolean;
  secretReferencesValidated: boolean;
}

export function evaluateDeploymentGate(input: DeploymentGate): {
  allowed: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];

  if (!input.sourceRevision.trim()) blockers.push("SOURCE_REVISION_REQUIRED");
  if (!input.artifactDigest.trim()) blockers.push("ARTIFACT_DIGEST_REQUIRED");
  if (!input.rollbackPlanPresent) blockers.push("ROLLBACK_PLAN_REQUIRED");
  if (!input.secretReferencesValidated) blockers.push("SECRET_REFERENCES_NOT_VALIDATED");

  for (const check of input.requiredChecks) {
    if (check.status !== "passed") blockers.push(`REQUIRED_CHECK_NOT_PASSED:${check.key}`);
    if (check.status === "passed" && !check.evidenceReference) {
      blockers.push(`CHECK_EVIDENCE_REQUIRED:${check.key}`);
    }
  }

  if (input.environment !== "development" && !input.migrationPlanApproved) {
    blockers.push("MIGRATION_PLAN_APPROVAL_REQUIRED");
  }

  if (input.environment === "production" && !input.humanApprovalPresent) {
    blockers.push("PRODUCTION_APPROVAL_REQUIRED");
  }

  return { allowed: blockers.length === 0, blockers };
}

export interface DeploymentExecutor {
  recordEvent(type: string, details: Record<string, unknown>): Promise<void>;
  executeApprovedDeployment(): Promise<void>;
  verifyPostDeployment(): Promise<{ healthy: boolean; evidenceReference?: string }>;
}

export async function runApprovedDeployment(
  executor: DeploymentExecutor,
  gate: DeploymentGate,
): Promise<{ status: "blocked" | "deployed" | "verification_failed"; blockers: string[] }> {
  const decision = evaluateDeploymentGate(gate);

  if (!decision.allowed) {
    await executor.recordEvent("deployment.blocked", {
      environment: gate.environment,
      blockers: decision.blockers,
    });
    return { status: "blocked", blockers: decision.blockers };
  }

  await executor.executeApprovedDeployment();
  const verification = await executor.verifyPostDeployment();

  if (!verification.healthy || !verification.evidenceReference) {
    await executor.recordEvent("deployment.postcheck_failed", {
      environment: gate.environment,
      evidenceReference: verification.evidenceReference,
    });
    return { status: "verification_failed", blockers: ["POST_DEPLOYMENT_VERIFICATION_FAILED"] };
  }

  await executor.recordEvent("deployment.verified", {
    environment: gate.environment,
    evidenceReference: verification.evidenceReference,
  });

  return { status: "deployed", blockers: [] };
}
