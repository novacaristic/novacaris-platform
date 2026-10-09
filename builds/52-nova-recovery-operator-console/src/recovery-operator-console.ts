import type { RequestContext } from "../../../builds/44-shared-platform-foundation/src/contracts";
import type { SqlPool } from "../../../builds/46-first-integration-pilot/src/postgres-operation-store";

export type OperatorQueueStatus = "executing" | "completed" | "reconciliation_required";
export type OperatorDisposition = "downstream_completed" | "downstream_not_executed" | "manual_follow_up";

export interface RecoveryQueueItem {
  execution_id: string;
  case_id: string;
  operation_id: string;
  event_id: string;
  execution_status: OperatorQueueStatus;
  idempotency_key: string;
  requested_by_actor: string;
  authorization_reference: string;
  downstream_reference: string | null;
  evidence_reference: string | null;
  failure_code: string | null;
  started_at: string;
  completed_at: string | null;
  case_resolution: string | null;
  case_resolution_evidence: string | null;
  review_id: string | null;
  review_disposition: OperatorDisposition | null;
  review_evidence_reference: string | null;
  reviewed_by_actor: string | null;
  reviewed_at: string | null;
}
export interface OperatorReview {
  id: string;
  tenant_id: string;
  execution_id: string;
  disposition: OperatorDisposition;
  evidence_reference: string;
  review_note: string;
  reviewed_by_actor: string;
  authorization_reference: string;
  reviewed_at: string;
}
export type OperatorAuthorizer = (context: RequestContext, action: "recovery.queue.read" | "recovery.ambiguous.review") => Promise<boolean>;

function required(value: string | undefined, code: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}
function requireHuman(context: RequestContext): void {
  required(context.tenantId, "OPERATOR_TENANT_REQUIRED");
  required(context.actor?.reference, "OPERATOR_ACTOR_REQUIRED");
  if (context.actor.type !== "user") throw new Error("OPERATOR_HUMAN_ACTOR_REQUIRED");
}
function validateDisposition(value: OperatorDisposition): void {
  if (!["downstream_completed", "downstream_not_executed", "manual_follow_up"].includes(value)) {
    throw new Error("OPERATOR_DISPOSITION_INVALID");
  }
}

export class RecoveryOperatorConsole {
  constructor(private readonly pool: SqlPool, private readonly authorize: OperatorAuthorizer) {}

  async listQueue(context: RequestContext, options: { status?: OperatorQueueStatus; limit?: number } = {}): Promise<RecoveryQueueItem[]> {
    requireHuman(context);
    if (!(await this.authorize(context, "recovery.queue.read"))) throw new Error("OPERATOR_QUEUE_FORBIDDEN");
    const limit = options.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("OPERATOR_QUEUE_LIMIT_INVALID");
    if (options.status && !["executing", "completed", "reconciliation_required"].includes(options.status)) throw new Error("OPERATOR_QUEUE_STATUS_INVALID");
    const result = await this.pool.query<RecoveryQueueItem>(
      `SELECT e.id AS execution_id, e.case_id, c.operation_id, c.event_id,
              e.status AS execution_status, e.idempotency_key, e.requested_by_actor,
              e.authorization_reference, e.downstream_reference, e.evidence_reference,
              e.failure_code, e.started_at, e.completed_at, c.resolution AS case_resolution,
              c.resolution_evidence_reference AS case_resolution_evidence,
              r.id AS review_id, r.disposition AS review_disposition,
              r.evidence_reference AS review_evidence_reference,
              r.reviewed_by_actor, r.reviewed_at
         FROM nova_pilot_recovery_executions e
         JOIN nova_pilot_reconciliation_cases c
           ON c.id = e.case_id AND c.tenant_id = e.tenant_id
         LEFT JOIN nova_pilot_recovery_operator_reviews r
           ON r.execution_id = e.id AND r.tenant_id = e.tenant_id
        WHERE e.tenant_id = $1::uuid AND ($2::text IS NULL OR e.status = $2)
        ORDER BY CASE WHEN e.status = 'reconciliation_required' THEN 0 WHEN e.status = 'executing' THEN 1 ELSE 2 END,
                 e.started_at ASC
        LIMIT $3`,
      [context.tenantId, options.status ?? null, limit],
    );
    return result.rows;
  }

  async reviewAmbiguous(context: RequestContext, input: {
    executionId: string;
    disposition: OperatorDisposition;
    evidenceReference: string;
    note: string;
  }): Promise<OperatorReview> {
    requireHuman(context);
    required(context.authorizationDecisionReference, "OPERATOR_AUTHORIZATION_REFERENCE_REQUIRED");
    if (!(await this.authorize(context, "recovery.ambiguous.review"))) throw new Error("OPERATOR_REVIEW_FORBIDDEN");
    const executionId = required(input.executionId, "OPERATOR_EXECUTION_ID_REQUIRED");
    const evidenceReference = required(input.evidenceReference, "OPERATOR_EVIDENCE_REQUIRED");
    const note = required(input.note, "OPERATOR_REVIEW_NOTE_REQUIRED");
    validateDisposition(input.disposition);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<{ id: string; status: string }>(
        "SELECT id, status FROM nova_pilot_recovery_executions WHERE tenant_id = $1::uuid AND id = $2::uuid FOR UPDATE",
        [context.tenantId, executionId],
      );
      const execution = found.rows[0];
      if (!execution) throw new Error("OPERATOR_EXECUTION_NOT_FOUND");
      if (execution.status !== "reconciliation_required") throw new Error("OPERATOR_EXECUTION_NOT_AMBIGUOUS");
      const prior = await client.query<OperatorReview>(
        "SELECT * FROM nova_pilot_recovery_operator_reviews WHERE tenant_id = $1::uuid AND execution_id = $2::uuid FOR UPDATE",
        [context.tenantId, executionId],
      );
      if (prior.rows[0]) {
        const row = prior.rows[0];
        if (row.disposition === input.disposition && row.evidence_reference === evidenceReference &&
            row.review_note === note && row.reviewed_by_actor === context.actor.reference &&
            row.authorization_reference === context.authorizationDecisionReference) {
          await client.query("COMMIT");
          return row;
        }
        throw new Error("OPERATOR_EXECUTION_ALREADY_REVIEWED");
      }
      const inserted = await client.query<OperatorReview>(
        `INSERT INTO nova_pilot_recovery_operator_reviews
          (tenant_id, execution_id, disposition, evidence_reference, review_note, reviewed_by_actor, authorization_reference)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7) RETURNING *`,
        [context.tenantId, executionId, input.disposition, evidenceReference, note, context.actor.reference, context.authorizationDecisionReference],
      );
      const review = inserted.rows[0];
      await client.query(
        `INSERT INTO nova_pilot_recovery_operator_audit
          (tenant_id, review_id, action, actor_reference, details)
         VALUES ($1::uuid, $2::uuid, 'ambiguous_execution_reviewed', $3, $4::jsonb)`,
        [context.tenantId, review.id, context.actor.reference, JSON.stringify({ executionId, disposition: input.disposition, evidenceReference, note, authorizationReference: context.authorizationDecisionReference })],
      );
      // A review records an operator conclusion only. It never changes execution status or starts another adapter call.
      await client.query("COMMIT");
      return review;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }
}
