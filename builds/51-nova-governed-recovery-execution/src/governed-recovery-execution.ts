import type { RequestContext } from "../../../builds/44-shared-platform-foundation/src/contracts";
import type { SqlPool } from "../../../builds/46-first-integration-pilot/src/postgres-operation-store";

export interface RecoveryExecution {
  id: string;
  tenant_id: string;
  case_id: string;
  idempotency_key: string;
  requested_by_actor: string;
  authorization_reference: string;
  status: "executing" | "completed" | "reconciliation_required";
  downstream_reference: string | null;
  evidence_reference: string | null;
  failure_code: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface RecoveryAdapterInput {
  tenantId: string;
  caseId: string;
  executionId: string;
  eventId: string;
  operationId: string;
  idempotencyKey: string;
  authorizationReference: string;
}
export interface RecoveryAdapterResult {
  downstreamReference: string;
  evidenceReference: string;
}
export type RecoveryAdapter = (input: RecoveryAdapterInput) => Promise<RecoveryAdapterResult>;
export type RecoveryAuthorizer = (context: RequestContext, action: "recovery.execute") => Promise<boolean>;

function required(value: string | undefined, code: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}
function requireHuman(context: RequestContext): void {
  required(context.tenantId, "RECOVERY_TENANT_REQUIRED");
  required(context.actor?.reference, "RECOVERY_ACTOR_REQUIRED");
  if (context.actor.type !== "user") throw new Error("RECOVERY_HUMAN_ACTOR_REQUIRED");
  required(context.authorizationDecisionReference, "RECOVERY_AUTHORIZATION_REFERENCE_REQUIRED");
}

export class GovernedRecoveryExecution {
  constructor(
    private readonly pool: SqlPool,
    private readonly authorize: RecoveryAuthorizer,
    private readonly adapter: RecoveryAdapter,
  ) {}

  async execute(context: RequestContext, input: { caseId: string; idempotencyKey: string }): Promise<RecoveryExecution> {
    requireHuman(context);
    if (!(await this.authorize(context, "recovery.execute"))) throw new Error("RECOVERY_FORBIDDEN");
    const caseId = required(input.caseId, "RECOVERY_CASE_ID_REQUIRED");
    const key = required(input.idempotencyKey, "RECOVERY_IDEMPOTENCY_KEY_REQUIRED");
    const client = await this.pool.connect();
    let reserved: RecoveryExecution;
    let eventId: string;
    let operationId: string;
    try {
      await client.query("BEGIN");
      const selected = await client.query<{
        id: string; operation_id: string; event_id: string; state: string;
        resolution: string | null; resolution_evidence_reference: string | null;
      }>(
        `SELECT id, operation_id, event_id, state, resolution, resolution_evidence_reference
           FROM nova_pilot_reconciliation_cases
          WHERE tenant_id = $1::uuid AND id = $2::uuid FOR UPDATE`,
        [context.tenantId, caseId],
      );
      const row = selected.rows[0];
      if (!row) throw new Error("RECOVERY_CASE_NOT_FOUND");
      if (row.state !== "resolved") throw new Error("RECOVERY_CASE_NOT_RESOLVED");
      if (row.resolution !== "downstream_not_executed") throw new Error("RECOVERY_RESOLUTION_NOT_EXECUTABLE");
      if (!row.resolution_evidence_reference) throw new Error("RECOVERY_RESOLUTION_EVIDENCE_REQUIRED");
      eventId = row.event_id;
      operationId = row.operation_id;

      const prior = await client.query<RecoveryExecution>(
        `SELECT * FROM nova_pilot_recovery_executions
          WHERE tenant_id = $1::uuid AND case_id = $2::uuid AND idempotency_key = $3 FOR UPDATE`,
        [context.tenantId, caseId, key],
      );
      if (prior.rows[0]) {
        const existing = prior.rows[0];
        if (existing.status === "completed") {
          await client.query("COMMIT");
          return existing;
        }
        if (existing.status === "reconciliation_required") throw new Error("RECOVERY_OUTCOME_AMBIGUOUS_NO_BLIND_RETRY");
        throw new Error("RECOVERY_ALREADY_IN_PROGRESS");
      }
      const inserted = await client.query<RecoveryExecution>(
        `INSERT INTO nova_pilot_recovery_executions
          (tenant_id, case_id, idempotency_key, requested_by_actor, authorization_reference, status)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'executing') RETURNING *`,
        [context.tenantId, caseId, key, context.actor.reference, context.authorizationDecisionReference],
      );
      reserved = inserted.rows[0];
      await client.query(
        `INSERT INTO nova_pilot_recovery_execution_audit
          (tenant_id, execution_id, action, actor_reference, details)
         VALUES ($1::uuid, $2::uuid, 'recovery_reserved', $3, $4::jsonb)`,
        [context.tenantId, reserved.id, context.actor.reference, JSON.stringify({ caseId, idempotencyKey: key, authorizationReference: context.authorizationDecisionReference })],
      );
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }

    // An adapter exception is ambiguous: persist a stop state and never blindly retry this key.
    let result: RecoveryAdapterResult;
    try {
      result = await this.adapter({
        tenantId: context.tenantId, caseId, executionId: reserved.id, eventId, operationId,
        idempotencyKey: key, authorizationReference: context.authorizationDecisionReference!,
      });
      required(result?.downstreamReference, "RECOVERY_ADAPTER_REFERENCE_REQUIRED");
      required(result?.evidenceReference, "RECOVERY_ADAPTER_EVIDENCE_REQUIRED");
    } catch (error) {
      const failureCode = error instanceof Error ? error.message.slice(0, 160) : "ADAPTER_OUTCOME_AMBIGUOUS";
      await this.markAmbiguous(context, reserved.id, failureCode);
      throw new Error("RECOVERY_OUTCOME_AMBIGUOUS_NO_BLIND_RETRY");
    }

    const finished = await this.pool.query<RecoveryExecution>(
      `UPDATE nova_pilot_recovery_executions
          SET status = 'completed', downstream_reference = $3, evidence_reference = $4, completed_at = now()
        WHERE tenant_id = $1::uuid AND id = $2::uuid AND status = 'executing'
        RETURNING *`,
      [context.tenantId, reserved.id, result.downstreamReference.trim(), result.evidenceReference.trim()],
    );
    if (!finished.rows[0]) {
      await this.markAmbiguous(context, reserved.id, "PERSIST_COMPLETION_FAILED");
      throw new Error("RECOVERY_OUTCOME_AMBIGUOUS_NO_BLIND_RETRY");
    }
    await this.pool.query(
      `INSERT INTO nova_pilot_recovery_execution_audit
        (tenant_id, execution_id, action, actor_reference, details)
       VALUES ($1::uuid, $2::uuid, 'recovery_completed', $3, $4::jsonb)`,
      [context.tenantId, reserved.id, context.actor.reference, JSON.stringify({ downstreamReference: result.downstreamReference, evidenceReference: result.evidenceReference })],
    );
    return finished.rows[0];
  }

  private async markAmbiguous(context: RequestContext, executionId: string, failureCode: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE nova_pilot_recovery_executions SET status = 'reconciliation_required', failure_code = $3
          WHERE tenant_id = $1::uuid AND id = $2::uuid AND status = 'executing' RETURNING id`,
        [context.tenantId, executionId, failureCode],
      );
      if (updated.rows[0]) {
        await client.query(
          `INSERT INTO nova_pilot_recovery_execution_audit
            (tenant_id, execution_id, action, actor_reference, details)
           VALUES ($1::uuid, $2::uuid, 'recovery_outcome_ambiguous', $3, $4::jsonb)`,
          [context.tenantId, executionId, context.actor.reference, JSON.stringify({ failureCode })],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }
}
