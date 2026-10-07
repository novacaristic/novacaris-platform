export type AgentRisk = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type AgentAction = "READ" | "RECOMMEND" | "PREPARE" | "EXECUTE_WITH_APPROVAL" | "AUTONOMOUS";
export type PermissionDecision = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

export interface AgentDefinition {
  id: string;
  name: string;
  purpose: string;
  risk: AgentRisk;
  modelPolicy: {
    allowedProviders: string[];
    allowedModels?: string[];
    requireProvenance: boolean;
  };
  defaultActionCeiling: AgentAction;
}

export interface Permission {
  id: string;
  agentId: string;
  resource: string;
  actions: AgentAction[];
  scopes: string[];
  decision: PermissionDecision;
  requiresHumanApproval: boolean;
  expiresAt?: string;
}

const rank: Record<AgentAction, number> = {
  READ: 1,
  RECOMMEND: 2,
  PREPARE: 3,
  EXECUTE_WITH_APPROVAL: 4,
  AUTONOMOUS: 5
};

export function canAct(
  agent: AgentDefinition,
  permission: Permission,
  action: AgentAction,
  now = new Date()
): { allowed: boolean; requiresApproval: boolean; reason: string } {
  if (permission.agentId !== agent.id)
    return { allowed: false, requiresApproval: false, reason: "Permission is assigned to a different agent" };

  if (permission.expiresAt && new Date(permission.expiresAt) <= now)
    return { allowed: false, requiresApproval: false, reason: "Permission has expired" };

  if (!permission.actions.includes(action))
    return { allowed: false, requiresApproval: false, reason: "Action is outside the granted permission" };

  if (rank[action] > rank[agent.defaultActionCeiling])
    return { allowed: false, requiresApproval: false, reason: "Action exceeds the agent risk ceiling" };

  if (permission.decision === "DENY")
    return { allowed: false, requiresApproval: false, reason: "Permission explicitly denied" };

  const requiresApproval =
    permission.requiresHumanApproval ||
    permission.decision === "REQUIRE_APPROVAL" ||
    action === "EXECUTE_WITH_APPROVAL";

  return {
    allowed: true,
    requiresApproval,
    reason: requiresApproval ? "Authorized only after human approval" : "Action permitted"
  };
}
