export type RiskTier = "low" | "moderate" | "high" | "prohibited" | "unassessed";

export interface EvaluationGate {
  useCaseRisk: RiskTier;
  evaluationPassed: boolean;
  evaluationMatchesConfiguration: boolean;
  humanReviewApproved: boolean;
  securityReviewApproved: boolean;
  incidentHoldActive: boolean;
}

export function evaluateDeploymentGate(
  gate: EvaluationGate,
): { allowed: boolean; blockers: string[] } {
  const blockers: string[] = [];

  if (gate.useCaseRisk === "unassessed") blockers.push("RISK_CLASSIFICATION_REQUIRED");
  if (gate.useCaseRisk === "prohibited") blockers.push("USE_CASE_PROHIBITED");
  if (!gate.evaluationPassed) blockers.push("EVALUATION_NOT_PASSED");
  if (!gate.evaluationMatchesConfiguration) blockers.push("EVALUATION_CONFIGURATION_MISMATCH");
  if (!gate.humanReviewApproved) blockers.push("HUMAN_REVIEW_REQUIRED");
  if (!gate.securityReviewApproved) blockers.push("SECURITY_REVIEW_REQUIRED");
  if (gate.incidentHoldActive) blockers.push("INCIDENT_HOLD_ACTIVE");

  return { allowed: blockers.length === 0, blockers };
}

export interface GovernanceEventWriter {
  recordEvent(type: string, details: Record<string, unknown>): Promise<void>;
  verifyReleaseAuthority(): Promise<boolean>;
  deployApprovedVersion(): Promise<void>;
}

export async function authorizeDeployment(
  writer: GovernanceEventWriter,
  gate: EvaluationGate,
): Promise<{ deployed: boolean; blockers: string[] }> {
  const decision = evaluateDeploymentGate(gate);

  if (!decision.allowed) {
    await writer.recordEvent("ai.deployment.blocked", { blockers: decision.blockers });
    return { deployed: false, blockers: decision.blockers };
  }

  if (!(await writer.verifyReleaseAuthority())) {
    const blockers = ["RELEASE_AUTHORITY_REQUIRED"];
    await writer.recordEvent("ai.deployment.blocked", { blockers });
    return { deployed: false, blockers };
  }

  await writer.deployApprovedVersion();
  await writer.recordEvent("ai.deployment.authorized", {
    riskTier: gate.useCaseRisk,
  });

  return { deployed: true, blockers: [] };
}
