export interface SecurityContext {
  tenantId: string;
  userId?: string;
  agentId?: string;
  resourceType: string;
  resourceId: string;
  purpose: string;
  subjectId?: string;
}

export interface SecurityDependencies {
  isAuthenticated(context: SecurityContext): Promise<boolean>;
  hasScope(context: SecurityContext): Promise<boolean>;
  hasPrivacyHold(context: SecurityContext): Promise<boolean>;
  policyAllows(context: SecurityContext): Promise<boolean>;
  recordAccessDecision(
    context: SecurityContext,
    decision: "allow" | "deny",
    reason: string,
  ): Promise<void>;
}

export async function securityGate(
  deps: SecurityDependencies,
  context: SecurityContext,
): Promise<boolean> {
  if (!(await deps.isAuthenticated(context))) {
    await deps.recordAccessDecision(context, "deny", "UNAUTHENTICATED");
    return false;
  }

  if (!(await deps.hasScope(context))) {
    await deps.recordAccessDecision(context, "deny", "SCOPE_DENIED");
    return false;
  }

  if (await deps.hasPrivacyHold(context)) {
    await deps.recordAccessDecision(context, "deny", "PRIVACY_HOLD");
    return false;
  }

  if (!(await deps.policyAllows(context))) {
    await deps.recordAccessDecision(context, "deny", "POLICY_DENIED");
    return false;
  }

  await deps.recordAccessDecision(context, "allow", "SECURITY_POLICY_PASSED");
  return true;
}
