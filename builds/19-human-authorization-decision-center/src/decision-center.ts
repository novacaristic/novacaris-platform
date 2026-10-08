export type Decision = "approve" | "deny" | "request_more_information" | "defer" | "delegate";

export interface DecisionContext {
  tenantId: string;
  userId: string;
  decisionRequestId: string;
}

export interface PolicyDecision {
  allowed: boolean;
  requiredApprovers: number;
  reason?: string;
}

export interface DecisionDependencies {
  evaluatePolicy(context: DecisionContext, decision: Decision): Promise<PolicyDecision>;
  recordDecision(context: DecisionContext, decision: Decision, rationale: string): Promise<string>;
  issueAuthorization(
    context: DecisionContext,
    decision: Decision,
    policy: PolicyDecision,
  ): Promise<string | null>;
}

export async function submitDecision(
  deps: DecisionDependencies,
  context: DecisionContext,
  decision: Decision,
  rationale: string,
): Promise<{ decisionId: string; authorizationId: string | null }> {
  const policy = await deps.evaluatePolicy(context, decision);

  if (!policy.allowed) {
    throw new Error(policy.reason || "DECISION_NOT_AUTHORIZED");
  }

  const decisionId = await deps.recordDecision(context, decision, rationale);
  const authorizationId =
    decision === "approve"
      ? await deps.issueAuthorization(context, decision, policy)
      : null;

  return { decisionId, authorizationId };
}
