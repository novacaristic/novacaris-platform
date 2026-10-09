import type { RequestContext } from "../../../builds/44-shared-platform-foundation/src/contracts";
import type { SqlPool } from "../../../builds/46-first-integration-pilot/src/postgres-operation-store";

export type EscalationPriority = "normal" | "high" | "urgent";
export type EscalationStatus = "open" | "acknowledged" | "resolved";
export interface RecoveryEscalation {
  id: string;
  tenant_id: string;
  execution_id: string;
  priority: EscalationPriority;
  status: EscalationStatus;
  reason: string;
  assigned_to_actor: string | null;
  created_by_actor: string;
  authorization_reference: string;
  due_at: string | null;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by_actor: string | null;
  resolved_at: string | null;
  resolved_by_actor: string | null;
  resolution_evidence_reference: string | null;
  resolution_note: string | null;
}
export type EscalationAuthorizer = (context: RequestContext, action: "recovery.escalation.read" | "recovery.escalation.create" | "recovery.escalation.acknowledge" | "recovery.escalation.resolve" | "recovery.escalation.assign") => Promise<boolean>;

function required(value: string | undefined, code: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}
function human(context: RequestContext): void {
  required(context.tenantId, "ESCALATION_TENANT_REQUIRED");
  required(context.actor?.reference, "ESCALATION_ACTOR_REQUIRED");
  if (context.actor.type !== "user") throw new Error("ESCALATION_HUMAN_ACTOR_REQUIRED");
}
function allowed<T extends string>(value: T, values: readonly T[], code: string): T {
  if (!values.includes(value)) throw new Error(code);
  return value;
}

export class RecoveryEscalations {
  constructor(private readonly pool: SqlPool, private readonly authorize: EscalationAuthorizer) {}

  async list(context: RequestContext, options: { status?: EscalationStatus; priority?: EscalationPriority; limit?: number } = {}): Promise<RecoveryEscalation[]> {
    human(context);
    if (!(await this.authorize(context, "recovery.escalation.read"))) throw new Error("ESCALATION_READ_FORBIDDEN");
    const limit = options.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("ESCALATION_LIMIT_INVALID");
    if (options.status) allowed(options.status, ["open", "acknowledged", "resolved"], "ESCALATION_STATUS_INVALID");
    if (options.priority) allowed(options.priority, ["normal", "high", "urgent"], "ESCALATION_PRIORITY_INVALID");
    const client = await this.pool.connect();
    try {
      const result = await client.query<RecoveryEscalation>(
        `SELECT * FROM nova_pilot_recovery_escalations
          WHERE tenant_id = $1::uuid AND ($2::text IS NULL OR status = $2) AND ($3::text IS NULL OR priority = $3)
          ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
                   CASE status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END, created_at ASC
          LIMIT $4`,
        [context.tenantId, options.status ?? null, options.priority ?? null, limit],
      );
      return result.rows;
    } finally { client.release(); }
  }

  async open(context: RequestContext, input: { executionId: string; priority: EscalationPriority; reason: string; assignedToActor?: string; dueAt?: string }): Promise<RecoveryEscalation> {
    human(context);
    required(context.authorizationDecisionReference, "ESCALATION_AUTHORIZATION_REFERENCE_REQUIRED");
    if (!(await this.authorize(context, "recovery.escalation.create"))) throw new Error("ESCALATION_CREATE_FORBIDDEN");
    const executionId = required(input.executionId, "ESCALATION_EXECUTION_ID_REQUIRED");
    const reason = required(input.reason, "ESCALATION_REASON_REQUIRED");
    const priority = allowed(input.priority, ["normal", "high", "urgent"], "ESCALATION_PRIORITY_INVALID");
    const assigned = input.assignedToActor?.trim() || null;
    let dueAt: Date | null = null;
    if (input.dueAt) {
      dueAt = new Date(input.dueAt);
      if (!Number.isFinite(dueAt.getTime())) throw new Error("ESCALATION_DUE_AT_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const execution = await client.query<{ id: string; status: string }>(
        "SELECT id, status FROM nova_pilot_recovery_executions WHERE tenant_id = $1::uuid AND id = $2::uuid FOR UPDATE",
        [context.tenantId, executionId],
      );
      if (!execution.rows[0]) throw new Error("ESCALATION_EXECUTION_NOT_FOUND");
      if (execution.rows[0].status !== "reconciliation_required") throw new Error("ESCALATION_EXECUTION_NOT_AMBIGUOUS");
      const inserted = await client.query<RecoveryEscalation>(
        `INSERT INTO nova_pilot_recovery_escalations
          (tenant_id, execution_id, priority, reason, assigned_to_actor, created_by_actor, authorization_reference, due_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (tenant_id, execution_id) DO NOTHING RETURNING *`,
        [context.tenantId, executionId, priority, reason, assigned, context.actor.reference, context.authorizationDecisionReference, dueAt],
      );
      let row = inserted.rows[0];
      if (row) {
        await this.audit(client, context, row.id, "escalation_opened", { executionId, priority, reason, assignedToActor: assigned, dueAt: dueAt?.toISOString() ?? null });
      } else {
        const prior = await client.query<RecoveryEscalation>(
          "SELECT * FROM nova_pilot_recovery_escalations WHERE tenant_id = $1::uuid AND execution_id = $2 FOR UPDATE",
          [context.tenantId, executionId],
        );
        row = prior.rows[0];
        if (!row) throw new Error("ESCALATION_LOOKUP_FAILED");
      }
      await client.query("COMMIT");
      return row;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async acknowledge(context: RequestContext, escalationId: string): Promise<RecoveryEscalation> {
    human(context);
    if (!(await this.authorize(context, "recovery.escalation.acknowledge"))) throw new Error("ESCALATION_ACKNOWLEDGE_FORBIDDEN");
    const id = required(escalationId, "ESCALATION_ID_REQUIRED");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<RecoveryEscalation>(
        "SELECT * FROM nova_pilot_recovery_escalations WHERE tenant_id = $1::uuid AND id = $2::uuid FOR UPDATE",
        [context.tenantId, id],
      );
      const row = found.rows[0];
      if (!row) throw new Error("ESCALATION_NOT_FOUND");
      if (row.status === "acknowledged" && row.acknowledged_by_actor === context.actor.reference) {
        await client.query("COMMIT"); return row;
      }
      if (row.status !== "open") throw new Error("ESCALATION_NOT_OPEN");
      const updated = await client.query<RecoveryEscalation>(
        `UPDATE nova_pilot_recovery_escalations SET status = 'acknowledged', acknowledged_at = now(), acknowledged_by_actor = $3
          WHERE tenant_id = $1::uuid AND id = $2::uuid AND status = 'open' RETURNING *`,
        [context.tenantId, id, context.actor.reference],
      );
      const next = updated.rows[0];
      await this.audit(client, context, id, "escalation_acknowledged", {});
      await client.query("COMMIT");
      return next;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async assign(context: RequestContext, escalationId: string, assignedToActor: string): Promise<RecoveryEscalation> {
    human(context);
    if (!(await this.authorize(context, "recovery.escalation.assign"))) throw new Error("ESCALATION_ASSIGN_FORBIDDEN");
    const id = required(escalationId, "ESCALATION_ID_REQUIRED");
    const assignee = required(assignedToActor, "ESCALATION_ASSIGNEE_REQUIRED");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<RecoveryEscalation>(
        "SELECT * FROM nova_pilot_recovery_escalations WHERE tenant_id = $1::uuid AND id = $2::uuid FOR UPDATE",
        [context.tenantId, id],
      );
      const row = found.rows[0];
      if (!row) throw new Error("ESCALATION_NOT_FOUND");
      if (row.status === "resolved") throw new Error("ESCALATION_ALREADY_RESOLVED");
      if (row.assigned_to_actor === assignee) { await client.query("COMMIT"); return row; }
      const updated = await client.query<RecoveryEscalation>(
        "UPDATE nova_pilot_recovery_escalations SET assigned_to_actor = $3 WHERE tenant_id = $1::uuid AND id = $2::uuid RETURNING *",
        [context.tenantId, id, assignee],
      );
      await this.audit(client, context, id, "escalation_reassigned", { assignedToActor: assignee });
      await client.query("COMMIT");
      return updated.rows[0];
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async resolve(context: RequestContext, input: { escalationId: string; evidenceReference: string; note: string }): Promise<RecoveryEscalation> {
    human(context);
    required(context.authorizationDecisionReference, "ESCALATION_AUTHORIZATION_REFERENCE_REQUIRED");
    if (!(await this.authorize(context, "recovery.escalation.resolve"))) throw new Error("ESCALATION_RESOLVE_FORBIDDEN");
    const id = required(input.escalationId, "ESCALATION_ID_REQUIRED");
    const evidence = required(input.evidenceReference, "ESCALATION_RESOLUTION_EVIDENCE_REQUIRED");
    const note = required(input.note, "ESCALATION_RESOLUTION_NOTE_REQUIRED");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<RecoveryEscalation>(
        "SELECT * FROM nova_pilot_recovery_escalations WHERE tenant_id = $1::uuid AND id = $2::uuid FOR UPDATE",
        [context.tenantId, id],
      );
      const row = found.rows[0];
      if (!row) throw new Error("ESCALATION_NOT_FOUND");
      if (row.status === "resolved") {
        if (row.resolved_by_actor === context.actor.reference && row.resolution_evidence_reference === evidence && row.resolution_note === note) {
          await client.query("COMMIT"); return row;
        }
        throw new Error("ESCALATION_ALREADY_RESOLVED");
      }
      const updated = await client.query<RecoveryEscalation>(
        `UPDATE nova_pilot_recovery_escalations
            SET status = 'resolved', resolved_at = now(), resolved_by_actor = $3,
                resolution_evidence_reference = $4, resolution_note = $5
          WHERE tenant_id = $1::uuid AND id = $2::uuid RETURNING *`,
        [context.tenantId, id, context.actor.reference, evidence, note],
      );
      await this.audit(client, context, id, "escalation_resolved", { evidenceReference: evidence, note });
      await client.query("COMMIT");
      return updated.rows[0];
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  private async audit(client: { query<Row = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }> }, context: RequestContext, escalationId: string, action: "escalation_opened" | "escalation_acknowledged" | "escalation_resolved" | "escalation_reassigned", details: Record<string, unknown>): Promise<void> {
    await client.query(
      `INSERT INTO nova_pilot_recovery_escalation_audit (tenant_id, escalation_id, action, actor_reference, details)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb)`,
      [context.tenantId, escalationId, action, context.actor.reference, JSON.stringify(details)],
    );
  }
}
