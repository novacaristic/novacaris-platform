import type { AgentAction } from "../domain/agents.js";
import { AgentRegistry } from "../domain/registry.js";
import { EvidenceLedger } from "../domain/ledger.js";
import type { SessionContext } from "./workspace.js";
import { assertOrganizationScope } from "./identity.js";

export interface TrustAuthorization {
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
  authorizationRequestId?: string;
}

export function authorizeNOVAAction(
  session: SessionContext,
  registry: AgentRegistry,
  ledger: EvidenceLedger,
  input: { agentId: string; permissionId: string; action: AgentAction; subjectId: string; evidenceIds: string[] },
): TrustAuthorization {
  assertOrganizationScope(session, session.organizationId);
  const decision = registry.authorize(input.agentId, input.permissionId, input.action);
  if (!decision.allowed || !decision.requiresApproval) return decision;
  const request = ledger.requestAuthorization({
    id: \`auth:workspace:\${session.organizationId}:\${Date.now()}\`,
    agentId: input.agentId, action: input.action, subjectId: input.subjectId, evidenceIds: input.evidenceIds,
  });
  return { ...decision, authorizationRequestId: request.id };
}
