import type { EvidenceLedgerEntry, HumanApproval } from "./evidence.js";

export interface AuthorizationRequest {
  id: string;
  agentId: string;
  action: string;
  subjectId: string;
  evidenceIds: string[];
  requestedAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  decidedAt?: string;
  approverId?: string;
  rationale?: string;
}

export class EvidenceLedger {
  private readonly entries: EvidenceLedgerEntry[] = [];
  private readonly approvals = new Map<string, AuthorizationRequest>();

  append(entry: EvidenceLedgerEntry): EvidenceLedgerEntry {
    if (this.entries.some(existing => existing.id === entry.id))
      throw new Error(`Ledger entry already exists: ${entry.id}`);
    this.entries.push(Object.freeze({ ...entry, evidenceIds: [...entry.evidenceIds], metadata: { ...entry.metadata } }));
    return entry;
  }

  listAuthorizations(): readonly AuthorizationRequest[] {
    return [...this.approvals.values()];
  }

  list(): readonly EvidenceLedgerEntry[] {
    return this.entries;
  }

  requestAuthorization(
    request: Omit<AuthorizationRequest, "status" | "requestedAt">,
    now = new Date()
  ): AuthorizationRequest {
    if (this.approvals.has(request.id)) throw new Error(`Authorization request already exists: ${request.id}`);
    const created: AuthorizationRequest = {
      ...request,
      evidenceIds: [...request.evidenceIds],
      requestedAt: now.toISOString(),
      status: "PENDING"
    };
    this.approvals.set(created.id, created);
    this.append({
      id: `${created.id}:requested`,
      eventType: "AUTHORIZATION_REQUESTED",
      actorId: created.agentId,
      timestamp: created.requestedAt,
      subjectId: created.subjectId,
      evidenceIds: created.evidenceIds,
      metadata: { action: created.action, authorizationRequestId: created.id }
    });
    return created;
  }

  decideAuthorization(
    id: string,
    decision: "APPROVED" | "REJECTED",
    approverId: string,
    rationale: string,
    now = new Date()
  ): AuthorizationRequest {
    const request = this.approvals.get(id);
    if (!request) throw new Error(`Authorization request not found: ${id}`);
    if (request.status !== "PENDING") throw new Error(`Authorization request is already ${request.status}`);
    const updated = { ...request, status: decision, decidedAt: now.toISOString(), approverId, rationale };
    this.approvals.set(id, updated);
    this.append({
      id: `${id}:${decision.toLowerCase()}`,
      eventType: decision,
      actorId: approverId,
      timestamp: updated.decidedAt!,
      subjectId: request.subjectId,
      evidenceIds: request.evidenceIds,
      metadata: { action: request.action, authorizationRequestId: id, rationale }
    });
    return updated;
  }

  getAuthorization(id: string): AuthorizationRequest | undefined {
    return this.approvals.get(id);
  }

  recordExecution(
    actorId: string,
    subjectId: string,
    evidenceIds: string[],
    metadata: Record<string, string>,
    now = new Date()
  ): EvidenceLedgerEntry {
    const entry: EvidenceLedgerEntry = {
      id: `execution:${this.entries.length + 1}:${now.getTime()}`,
      eventType: "ACTION_EXECUTED",
      actorId,
      timestamp: now.toISOString(),
      subjectId,
      evidenceIds: [...evidenceIds],
      metadata: { ...metadata }
    };
    return this.append(entry);
  }
}

export type { HumanApproval };
