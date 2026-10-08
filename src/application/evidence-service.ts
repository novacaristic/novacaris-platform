import type { EvidenceRecord } from "../domain/evidence.js";
import type { SessionContext } from "./workspace.js";
import type { PersistenceRepository, EvidenceRow } from "./persistence.js";

export interface EvidenceSubmission {
  id: string;
  kind: string;
  payload: unknown;
}

export interface EvidenceSubmissionResult {
  accepted: boolean;
  evidenceId: string;
  organizationId: string;
  message: string;
}

export function validateEvidenceSubmission(
  session: SessionContext,
  submission: EvidenceSubmission,
): string[] {
  const errors: string[] = [];
  if (!session.organizationId) errors.push("Organization scope is required.");
  if (!submission.id) errors.push("Evidence ID is required.");
  if (!submission.kind) errors.push("Evidence kind is required.");
  if (submission.payload === undefined || submission.payload === null) {
    errors.push("Evidence payload is required.");
  }
  return errors;
}

export function toEvidenceRow(
  session: SessionContext,
  submission: EvidenceSubmission,
): EvidenceRow {
  const errors = validateEvidenceSubmission(session, submission);
  if (errors.length) throw new Error(errors.join(" "));
  return {
    id: submission.id,
    organizationId: session.organizationId,
    kind: submission.kind,
    payload: submission.payload,
    createdAt: new Date().toISOString(),
  };
}

export interface EvidenceRepository {
  saveEvidence(session: SessionContext, row: EvidenceRow): Promise<void>;
  listEvidence(session: SessionContext): Promise<EvidenceRow[]>;
}

export class MemoryEvidenceRepository implements EvidenceRepository {
  private readonly records = new Map<string, EvidenceRow[]>();

  async saveEvidence(session: SessionContext, row: EvidenceRow): Promise<void> {
    if (row.organizationId !== session.organizationId) {
      throw new Error("Organization scope mismatch.");
    }
    const current = this.records.get(session.organizationId) ?? [];
    current.push(row);
    this.records.set(session.organizationId, current);
  }

  async listEvidence(session: SessionContext): Promise<EvidenceRow[]> {
    return [...(this.records.get(session.organizationId) ?? [])];
  }
}

export function evidenceRowsToDomain(rows: EvidenceRow[]): EvidenceRecord[] {
  return rows.map((row) => row.payload as EvidenceRecord);
}
