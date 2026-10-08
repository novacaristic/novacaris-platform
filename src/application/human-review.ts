import type { ActionRecord } from "./action-engine.js";
import type { AuthorizationRequest, EvidenceLedger } from "../domain/ledger.js";
import type { SessionContext } from "./workspace.js";
import { requireRole } from "./identity.js";

export interface HumanReviewItem {
  id: string;
  kind: "ACTION" | "AUTHORIZATION";
  title: string;
  subjectId: string;
  evidenceIds: string[];
  requiresDecision: boolean;
  status: string;
  rationale?: string;
}

export interface HumanReviewDecision {
  decision: "APPROVED" | "REJECTED";
  rationale: string;
}

export interface HumanReviewCenter {
  list(session: SessionContext, actions: ActionRecord[], authorizations: AuthorizationRequest[]): HumanReviewItem[];
  decideAuthorization(session: SessionContext, ledger: EvidenceLedger, authorizationId: string, decision: HumanReviewDecision): AuthorizationRequest;
}

export class DefaultHumanReviewCenter implements HumanReviewCenter {
  list(session: SessionContext, actions: ActionRecord[], authorizations: AuthorizationRequest[]): HumanReviewItem[] {
    requireRole(session, "OWNER", "ADMIN", "COMPLIANCE");
    const actionItems = actions.filter((a) => a.requiresHumanAuthorization && a.status !== "COMPLETED").map((a) => ({
      id: a.id, kind: "ACTION" as const, title: a.title, subjectId: a.organizationId,
      evidenceIds: a.evidenceIds, requiresDecision: true, status: a.status,
    }));
    const authItems = authorizations.map((a) => ({
      id: a.id, kind: "AUTHORIZATION" as const, title: a.action, subjectId: a.subjectId,
      evidenceIds: a.evidenceIds, requiresDecision: a.status === "PENDING", status: a.status, rationale: a.rationale,
    }));
    return [...actionItems, ...authItems];
  }

  decideAuthorization(session: SessionContext, ledger: EvidenceLedger, authorizationId: string, decision: HumanReviewDecision) {
    requireRole(session, "OWNER", "ADMIN", "COMPLIANCE");
    if (!decision.rationale.trim()) throw new Error("Decision rationale is required.");
    return ledger.decideAuthorization(authorizationId, decision.decision, session.userId, decision.rationale);
  }
}
