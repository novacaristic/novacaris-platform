export type EvidenceKind =
  | "LICENSE" | "ENROLLMENT" | "REVALIDATION" | "POLICY"
  | "TRAINING" | "DOCUMENTATION" | "CLAIM" | "OUTCOME" | "OTHER";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface EvidenceRecord {
  id: string;
  kind: EvidenceKind;
  source: string;
  subjectType: string;
  subjectId: string;
  hash: string;
  capturedAt: string;
  validFrom?: string;
  validTo?: string;
  provenance: {
    actor: "USER" | "AGENT" | "SYSTEM" | "CONNECTOR";
    actorId: string;
    sourceUri?: string;
  };
}

export interface HumanApproval {
  id: string;
  authorizationRequestId: string;
  approverId: string;
  status: ApprovalStatus;
  decisionAt?: string;
  rationale?: string;
  evidenceIds: string[];
}

export interface EvidenceLedgerEntry {
  id: string;
  eventType:
    | "EVIDENCE_CAPTURED"
    | "ASSESSMENT_CREATED"
    | "AUTHORIZATION_REQUESTED"
    | "APPROVED"
    | "REJECTED"
    | "ACTION_EXECUTED";
  actorId: string;
  timestamp: string;
  subjectId: string;
  evidenceIds: string[];
  metadata: Record<string, string>;
}

export function isEvidenceUsable(evidence: EvidenceRecord, now = new Date()): boolean {
  if (evidence.validFrom && new Date(evidence.validFrom) > now) return false;
  if (evidence.validTo && new Date(evidence.validTo) < now) return false;
  return true;
}
