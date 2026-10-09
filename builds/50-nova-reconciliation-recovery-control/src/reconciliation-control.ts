import type { RequestContext } from "../../../builds/44-shared-platform-foundation/src/contracts";
import type { SqlPool } from "../../../builds/46-first-integration-pilot/src/postgres-operation-store";

export type ReconciliationResolution =
  | "downstream_completed"
  | "downstream_not_executed"
  | "manual_follow_up";

export interface ReconciliationCase {
  id: string;
  tenant_id: string;
  operation_id: string;
  idempotency_key: string;
  event_id: string;
  downstream_reference: string;
  reason_code: string;
  state: "open" | "resolved";
  opened_at: string;
  resolved_at: string | null;
  resolved_by_actor: string | null;
  resolution: ReconciliationResolution | null;
  resolution_evidence_reference: string | null;
  resolution_note: string | null;
}

export type ReconciliationAuthorizer = (
  context: RequestContext,
  action: "reconciliation.open" | "reconciliation.resolve",
) => Promise<boolean>;

function requireHumanContext(context: RequestContext): void {
  if (!context.tenantId?.trim() || !context.actor?.reference?.trim()) throw new Error("RECONCILIATION_ACTOR_REQUIRED");
  if (context.actor.type !== "user") throw new Error("RECONCILIATION_HUMAN_ACTOR_REQUIRED");
}

function requireText(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

export class ReconciliationControl {
  constructor(
    private readonly pool: SqlPool,
    private readonly authorize: ReconciliationAuthorizer,
  ) {}

  async openFromOperation(context: RequestContext, input: {
    operationName: string;
    idempotencyKey: string;
  }): Promise<ReconciliationCase> {
    requireHumanContext(context);
    if (!(await this.authorize(context, "reconciliation.open"))) throw new Error("RECONCILIATION_FORBIDDEN");
    const operationName = requireText(input.operationName, "RECONCILIATION_OPERATION_REQUIRED");
    const key = requireText(input.idempotencyKey, "RECONCILIATION_IDEMPOTENCY_KEY_REQUIRED");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<{
        id: string; tenant_id: string; idempotency_key: string; status: string;
        result: { status?: string; reason?: string; downstreamReference?: string; eventId?: string } | null;
        downstream_reference: string | null; event_id: string | null; last_error_code: string | null;
      }>(
        `SELECT id, tenant_id, idempotency_key, status, result, downstream_reference, event_id, last_error_code
           FROM nova_pilot_operations
          WHERE tenant_id = $1::uuid AND operation_name = $2 AND idempotency_key = $3
          FOR UPDATE`,
        [context.tenantId, operationName, key],
      );
      const operation = found.rows[0];
      if (!operation) throw new Error("RECONCILIATION_OPERATION_NOT_FOUND");
      if (operation.status !== "reconciliation_required") throw new Error("OPERATION_NOT_RECONCILIATION_REQUIRED");
      const eventId = operation.event_id ?? operation.result?.eventId;
      const downstreamReference = operation.downstream_reference ?? operation.result?.downstreamReference;
      if (!eventId || !downstreamReference) throw new Error("RECONCILIATION_EVIDENCE_INCOMPLETE");
      const inserted = await client.query<ReconciliationCase>(
        `INSERT INTO nova_pilot_reconciliation_cases
          (tenant_id, operation_id, idempotency_key, event_id, downstream_reference, reason_code)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, operation_id) DO NOTHING
         RETURNING *`,
        [context.tenantId, operation.id, key, eventId, downstreamReference, operation.last_error_code ?? operation.result?.reason ?? "OUTCOME_AMBIGUOUS"],
      );
      let row = inserted.rows[0];
      if (row) {
        await client.query(
          "INSERT INTO nova_pilot_reconciliation_audit (tenant_id, case_id, action, actor_reference, details) VALUES ($1::uuid, $2::uuid, 'case_opened', $3, $4::jsonb)",
          [context.tenantId, row.id, context.actor.reference, JSON.stringify({ operationName, idempotencyKey: key, eventId, reasonCode: row.reason_code })],
        );
      } else {
        const existing = await client.query<ReconciliationCase>(
          "SELECT * FROM nova_pilot_reconciliation_cases WHERE tenant_id = $1::uuid AND operation_id = $2::uuid",
          [context.tenantId, operation.id],
        );
        row = existing.rows[0];
        if (!row) throw new Error("RECONCILIATION_CASE_LOOKUP_FAILED");
      }
      await client.query("COMMIT");
      return row;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async resolve(context: RequestContext, input: {
    caseId: string;
    resolution: ReconciliationResolution;
    evidenceReference: string;
    note: string;
  }): Promise<ReconciliationCase> {
    requireHumanContext(context);
    if (!(await this.authorize(context, "reconciliation.resolve"))) throw new Error("RECONCILIATION_FORBIDDEN");
    const caseId = requireText(input.caseId, "RECONCILIATION_CASE_ID_REQUIRED");
    const evidenceReference = requireText(input.evidenceReference, "RECONCILIATION_EVIDENCE_REFERENCE_REQUIRED");
    const note = requireText(input.note, "RECONCILIATION_NOTE_REQUIRED");
    if (!["downstream_completed", "downstream_not_executed", "manual_follow_up"].includes(input.resolution)) {
      throw new Error("RECONCILIATION_RESOLUTION_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<ReconciliationCase>(
        "SELECT * FROM nova_pilot_reconciliation_cases WHERE tenant_id = $1::uuid AND id = $2::uuid FOR UPDATE",
        [context.tenantId, caseId],
      );
      const prior = selected.rows[0];
      if (!prior) throw new Error("RECONCILIATION_CASE_NOT_FOUND");
      if (prior.state === "resolved") {
        if (prior.resolution === input.resolution &&
            prior.resolution_evidence_reference === evidenceReference &&
            prior.resolution_note === note &&
            prior.resolved_by_actor === context.actor.reference) {
          await client.query("COMMIT");
          return prior;
        }
        throw new Error("RECONCILIATION_CASE_ALREADY_RESOLVED");
      }
      const updated = await client.query<ReconciliationCase>(
        `UPDATE nova_pilot_reconciliation_cases
            SET state = 'resolved', resolved_at = now(), resolved_by_actor = $3,
                resolution = $4, resolution_evidence_reference = $5, resolution_note = $6
          WHERE tenant_id = $1::uuid AND id = $2::uuid AND state = 'open'
          RETURNING *`,
        [context.tenantId, caseId, context.actor.reference, input.resolution, evidenceReference, note],
      );
      const row = updated.rows[0];
      if (!row) throw new Error("RECONCILIATION_CASE_STATE_RACE");
      await client.query(
        "INSERT INTO nova_pilot_reconciliation_audit (tenant_id, case_id, action, actor_reference, details) VALUES ($1::uuid, $2::uuid, 'case_resolved', $3, $4::jsonb)",
        [context.tenantId, caseId, context.actor.reference, JSON.stringify({ resolution: input.resolution, evidenceReference, note })],
      );
      // Deliberately do not change operation state or execute/retry downstream work here.
      await client.query("COMMIT");
      return row;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }
}
