import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Pool } from "pg";
import type { RequestContext } from "../../../builds/44-shared-platform-foundation/src/contracts";
import { ReconciliationControl } from "../../../builds/50-nova-reconciliation-recovery-control/src/reconciliation-control";
import { GovernedRecoveryExecution } from "../../../builds/51-nova-governed-recovery-execution/src/governed-recovery-execution";
import { RecoveryEscalations } from "../src/recovery-escalations";

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const tenantId = randomUUID();
const context: RequestContext = {
  contractVersion: "1.0", requestId: "build-53-request", correlationId: "build-53-correlation",
  tenantId, actor: { type: "user", reference: "human-operator-53" },
  authorizationDecisionReference: "authz://synthetic/build-53/approved",
};

suite("Build 53 NOVA recovery escalation integration", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
  const reconciliation = new ReconciliationControl(pool, async () => true);

  beforeAll(async () => {
    const migrationPaths = [
      "builds/46-first-integration-pilot/sql/build_46_durable_execution.sql",
      "builds/50-nova-reconciliation-recovery-control/sql/build_50_reconciliation_control.sql",
      "builds/51-nova-governed-recovery-execution/sql/build_51_governed_recovery_execution.sql",
      "builds/52-nova-recovery-operator-console/sql/build_52_recovery_operator_console.sql",
      "builds/53-nova-recovery-operations-dashboard/sql/build_53_recovery_escalations.sql",
    ];
    const client = await pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(480046)");
      for (const path of migrationPaths) await client.query(await readFile(resolve(process.cwd(), path), "utf8"));
      await client.query("SELECT pg_advisory_unlock(480046)");
    } finally { client.release(); }
  });
  afterAll(async () => { await pool.end(); });

  async function seedAmbiguous(key: string): Promise<string> {
    await pool.query(
      `INSERT INTO nova_pilot_operations
        (tenant_id, operation_name, idempotency_key, request_fingerprint, original_request_id, status,
         result, downstream_reference, event_id, last_error_code)
       VALUES ($1::uuid, 'build_53_escalation_fixture', $2, 'synthetic-fingerprint', $2, 'reconciliation_required',
         $3::jsonb, $4, $5, 'OUTCOME_AMBIGUOUS')`,
      [tenantId, key, JSON.stringify({ downstreamReference: `synthetic-ref-${key}`, eventId: `synthetic-event-${key}` }), `synthetic-ref-${key}`, `synthetic-event-${key}`],
    );
    const c = await reconciliation.openFromOperation(context, { operationName: "build_53_escalation_fixture", idempotencyKey: key });
    await reconciliation.resolve(context, { caseId: c.id, resolution: "downstream_not_executed", evidenceReference: `evidence://synthetic/53/${key}`, note: "Synthetic lookup confirmed no downstream effect." });
    const runner = new GovernedRecoveryExecution(pool, async () => true, async () => { throw new Error("synthetic adapter response lost"); });
    await expect(runner.execute(context, { caseId: c.id, idempotencyKey: `exec-${key}` })).rejects.toThrow("RECOVERY_OUTCOME_AMBIGUOUS_NO_BLIND_RETRY");
    const row = await pool.query("SELECT id FROM nova_pilot_recovery_executions WHERE tenant_id = $1::uuid AND case_id = $2::uuid", [tenantId, c.id]);
    return row.rows[0].id as string;
  }

  it("opens one escalation per ambiguous execution and returns the existing record on repeat", async () => {
    const executionId = await seedAmbiguous("open");
    const service = new RecoveryEscalations(pool, async () => true);
    const input = { executionId, priority: "urgent" as const, reason: "Downstream outcome needs operator verification.", assignedToActor: "reviewer-53", dueAt: "2026-10-10T12:00:00Z" };
    const first = await service.open(context, input);
    const replay = await service.open(context, { ...input, priority: "normal" });
    expect(first.id).toBe(replay.id);
    expect(replay.priority).toBe("urgent");
    expect(replay.status).toBe("open");
    expect(replay.assigned_to_actor).toBe("reviewer-53");
  });

  it("orders urgent escalations first and applies tenant/status/priority filters", async () => {
    const a = await seedAmbiguous("queue-urgent");
    const b = await seedAmbiguous("queue-normal");
    const service = new RecoveryEscalations(pool, async () => true);
    await service.open(context, { executionId: b, priority: "normal", reason: "Normal priority review." });
    await service.open(context, { executionId: a, priority: "urgent", reason: "Urgent review." });
    const rows = await service.list(context, { status: "open", limit: 20 });
    expect(rows[0].priority).toBe("urgent");
    expect(rows.every(row => row.status === "open")).toBe(true);
    expect((await service.list(context, { priority: "normal" })).every(row => row.priority === "normal")).toBe(true);
    expect(await service.list({ ...context, tenantId: randomUUID() })).toEqual([]);
  });

  it("enforces human identity, authorization, and bounded queue limits", async () => {
    const service = new RecoveryEscalations(pool, async () => false);
    await expect(service.list({ ...context, actor: { type: "agent", reference: "mr-nova" } })).rejects.toThrow("ESCALATION_HUMAN_ACTOR_REQUIRED");
    await expect(service.list(context)).rejects.toThrow("ESCALATION_READ_FORBIDDEN");
    await expect(new RecoveryEscalations(pool, async () => true).list(context, { limit: 101 })).rejects.toThrow("ESCALATION_LIMIT_INVALID");
    await expect(new RecoveryEscalations(pool, async () => true).open({ ...context, authorizationDecisionReference: undefined }, { executionId: randomUUID(), priority: "high", reason: "missing authorization" })).rejects.toThrow("ESCALATION_AUTHORIZATION_REFERENCE_REQUIRED");
  });

  it("acknowledges, assigns, and resolves with evidence without changing execution status", async () => {
    const executionId = await seedAmbiguous("lifecycle");
    const service = new RecoveryEscalations(pool, async () => true);
    const opened = await service.open(context, { executionId, priority: "high", reason: "Review ambiguous recovery." });
    const acknowledged = await service.acknowledge(context, opened.id);
    expect(acknowledged.status).toBe("acknowledged");
    const assigned = await service.assign(context, opened.id, "senior-reviewer-53");
    expect(assigned.assigned_to_actor).toBe("senior-reviewer-53");
    const resolved = await service.resolve(context, { escalationId: opened.id, evidenceReference: "evidence://synthetic/53/resolved", note: "Reviewed logs; follow-up assigned." });
    expect(resolved.status).toBe("resolved");
    const replay = await service.resolve(context, { escalationId: opened.id, evidenceReference: "evidence://synthetic/53/resolved", note: "Reviewed logs; follow-up assigned." });
    expect(replay.id).toBe(resolved.id);
    const execution = await pool.query("SELECT status FROM nova_pilot_recovery_executions WHERE id = $1::uuid", [executionId]);
    expect(execution.rows[0].status).toBe("reconciliation_required");
    await expect(service.assign(context, opened.id, "another-reviewer")).rejects.toThrow("ESCALATION_ALREADY_RESOLVED");
  });

  it("records append-only audit for lifecycle changes and rejects audit mutation", async () => {
    const executionId = await seedAmbiguous("audit");
    const service = new RecoveryEscalations(pool, async () => true);
    const row = await service.open(context, { executionId, priority: "high", reason: "Audit test." });
    await service.acknowledge(context, row.id);
    await service.assign(context, row.id, "reviewer-audit");
    await service.resolve(context, { escalationId: row.id, evidenceReference: "evidence://synthetic/53/audit", note: "Completed review." });
    const audit = await pool.query("SELECT id, action FROM nova_pilot_recovery_escalation_audit WHERE tenant_id = $1::uuid AND escalation_id = $2::uuid ORDER BY id", [tenantId, row.id]);
    expect(audit.rows.map(x => x.action)).toEqual(["escalation_opened", "escalation_acknowledged", "escalation_reassigned", "escalation_resolved"]);
    await expect(pool.query("UPDATE nova_pilot_recovery_escalation_audit SET details = '{}'::jsonb WHERE id = $1", [audit.rows[0].id])).rejects.toThrow("RECOVERY_ESCALATION_AUDIT_APPEND_ONLY");
  });

  it("fails closed for cross-tenant acknowledgement and non-ambiguous executions", async () => {
    const executionId = await seedAmbiguous("tenant");
    const service = new RecoveryEscalations(pool, async () => true);
    const row = await service.open(context, { executionId, priority: "normal", reason: "Tenant isolation." });
    await expect(service.acknowledge({ ...context, tenantId: randomUUID() }, row.id)).rejects.toThrow("ESCALATION_NOT_FOUND");
    const completed = await pool.query(
      `INSERT INTO nova_pilot_recovery_executions (tenant_id, case_id, idempotency_key, requested_by_actor, authorization_reference, status, downstream_reference, evidence_reference, completed_at)
       SELECT tenant_id, id, 'completed-fixture', 'operator', 'authz://fixture', 'completed', 'downstream-ok', 'evidence://ok', now()
       FROM nova_pilot_reconciliation_cases WHERE tenant_id = $1::uuid AND id = (SELECT case_id FROM nova_pilot_recovery_executions WHERE id = $2::uuid)
       RETURNING id`,
      [tenantId, executionId],
    );
    await expect(service.open(context, { executionId: completed.rows[0].id, priority: "normal", reason: "Must reject completed execution." })).rejects.toThrow("ESCALATION_EXECUTION_NOT_AMBIGUOUS");
  });
});
