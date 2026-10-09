import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Pool } from "pg";
import type { RequestContext } from "../../../builds/44-shared-platform-foundation/src/contracts";
import { ReconciliationControl } from "../../../builds/50-nova-reconciliation-recovery-control/src/reconciliation-control";
import { GovernedRecoveryExecution } from "../../../builds/51-nova-governed-recovery-execution/src/governed-recovery-execution";
import { RecoveryOperatorConsole } from "../src/recovery-operator-console";

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const tenantId = randomUUID();
const context: RequestContext = {
  contractVersion: "1.0", requestId: "build-52-request", correlationId: "build-52-correlation",
  tenantId, actor: { type: "user", reference: "human-operator-52" },
  authorizationDecisionReference: "authz://synthetic/build-52/approved",
};

suite("Build 52 NOVA recovery operator console integration", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
  const reconciliation = new ReconciliationControl(pool, async () => true);

  beforeAll(async () => {
    const base = await readFile(resolve(process.cwd(), "builds/46-first-integration-pilot/sql/build_46_durable_execution.sql"), "utf8");
    const recon = await readFile(resolve(process.cwd(), "builds/50-nova-reconciliation-recovery-control/sql/build_50_reconciliation_control.sql"), "utf8");
    const execution = await readFile(resolve(process.cwd(), "builds/51-nova-governed-recovery-execution/sql/build_51_governed_recovery_execution.sql"), "utf8");
    const operator = await readFile(resolve(process.cwd(), "builds/52-nova-recovery-operator-console/sql/build_52_recovery_operator_console.sql"), "utf8");
    const client = await pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(480046)");
      await client.query(base);
      await client.query(recon);
      await client.query(execution);
      await client.query(operator);
      await client.query("SELECT pg_advisory_unlock(480046)");
    } finally { client.release(); }
  });
  afterAll(async () => { await pool.end(); });

  async function seedAmbiguous(key: string): Promise<string> {
    await pool.query(
      `INSERT INTO nova_pilot_operations
        (tenant_id, operation_name, idempotency_key, request_fingerprint, original_request_id, status,
         result, downstream_reference, event_id, last_error_code)
       VALUES ($1::uuid, 'build_52_operator_fixture', $2, 'synthetic-fingerprint', $2, 'reconciliation_required',
         $3::jsonb, $4, $5, 'OUTCOME_AMBIGUOUS')`,
      [tenantId, key, JSON.stringify({ downstreamReference: `synthetic-ref-${key}`, eventId: `synthetic-event-${key}` }), `synthetic-ref-${key}`, `synthetic-event-${key}`],
    );
    const c = await reconciliation.openFromOperation(context, { operationName: "build_52_operator_fixture", idempotencyKey: key });
    await reconciliation.resolve(context, { caseId: c.id, resolution: "downstream_not_executed", evidenceReference: `evidence://synthetic/52/${key}`, note: "Synthetic check confirms no side effect." });
    const runner = new GovernedRecoveryExecution(pool, async () => true, async () => { throw new Error("synthetic adapter response lost"); });
    await expect(runner.execute(context, { caseId: c.id, idempotencyKey: `exec-${key}` })).rejects.toThrow("RECOVERY_OUTCOME_AMBIGUOUS_NO_BLIND_RETRY");
    const row = await pool.query("SELECT id FROM nova_pilot_recovery_executions WHERE tenant_id = $1::uuid AND case_id = $2::uuid", [tenantId, c.id]);
    return row.rows[0].id as string;
  }

  it("lists tenant-scoped executions with ambiguous cases first and honors status filter", async () => {
    await seedAmbiguous("queue");
    const consoleService = new RecoveryOperatorConsole(pool, async () => true);
    const all = await consoleService.listQueue(context, { limit: 25 });
    expect(all.some(row => row.execution_status === "reconciliation_required" && row.failure_code !== null)).toBe(true);
    const filtered = await consoleService.listQueue(context, { status: "completed", limit: 25 });
    expect(filtered.every(row => row.execution_status === "completed")).toBe(true);
  });

  it("requires human identity and explicit queue authorization", async () => {
    const service = new RecoveryOperatorConsole(pool, async () => false);
    await expect(service.listQueue({ ...context, actor: { type: "agent", reference: "mr-nova" } })).rejects.toThrow("OPERATOR_HUMAN_ACTOR_REQUIRED");
    await expect(service.listQueue(context)).rejects.toThrow("OPERATOR_QUEUE_FORBIDDEN");
    await expect(new RecoveryOperatorConsole(pool, async () => true).listQueue(context, { limit: 101 })).rejects.toThrow("OPERATOR_QUEUE_LIMIT_INVALID");
  });

  it("records an evidence-backed ambiguous review without executing or mutating recovery", async () => {
    const executionId = await seedAmbiguous("review");
    const service = new RecoveryOperatorConsole(pool, async () => true);
    const before = await pool.query("SELECT status FROM nova_pilot_recovery_executions WHERE id = $1::uuid", [executionId]);
    const reviewed = await service.reviewAmbiguous(context, {
      executionId, disposition: "manual_follow_up",
      evidenceReference: "evidence://synthetic/52/operator-review",
      note: "Escalated for downstream reconciliation.",
    });
    expect(reviewed.disposition).toBe("manual_follow_up");
    const after = await pool.query("SELECT status FROM nova_pilot_recovery_executions WHERE id = $1::uuid", [executionId]);
    expect(after.rows[0].status).toBe(before.rows[0].status);
    const queue = await service.listQueue(context, { limit: 25 });
    expect(queue.find(row => row.execution_id === executionId)?.review_disposition).toBe("manual_follow_up");
  });

  it("allows exact replay but rejects conflicting review and cross-tenant access", async () => {
    const executionId = await seedAmbiguous("idempotent-review");
    const service = new RecoveryOperatorConsole(pool, async () => true);
    const input = { executionId, disposition: "downstream_not_executed" as const, evidenceReference: "evidence://synthetic/52/no-effect", note: "Reviewed downstream evidence." };
    const first = await service.reviewAmbiguous(context, input);
    const replay = await service.reviewAmbiguous(context, input);
    expect(replay.id).toBe(first.id);
    await expect(service.reviewAmbiguous(context, { ...input, note: "Conflicting review" })).rejects.toThrow("OPERATOR_EXECUTION_ALREADY_REVIEWED");
    await expect(service.reviewAmbiguous({ ...context, tenantId: randomUUID() }, input)).rejects.toThrow("OPERATOR_EXECUTION_NOT_FOUND");
    const audit = await pool.query("SELECT action FROM nova_pilot_recovery_operator_audit WHERE tenant_id = $1::uuid AND review_id = $2::uuid", [tenantId, first.id]);
    expect(audit.rows.map(row => row.action)).toEqual(["ambiguous_execution_reviewed"]);
  });

  it("prevents mutation of operator audit evidence", async () => {
    const executionId = await seedAmbiguous("audit");
    const service = new RecoveryOperatorConsole(pool, async () => true);
    const review = await service.reviewAmbiguous(context, { executionId, disposition: "manual_follow_up", evidenceReference: "evidence://synthetic/52/audit", note: "Audit immutability check." });
    const audit = await pool.query("SELECT id FROM nova_pilot_recovery_operator_audit WHERE tenant_id = $1::uuid AND review_id = $2::uuid", [tenantId, review.id]);
    await expect(pool.query("UPDATE nova_pilot_recovery_operator_audit SET details = '{}'::jsonb WHERE id = $1", [audit.rows[0].id])).rejects.toThrow("RECOVERY_OPERATOR_AUDIT_APPEND_ONLY");
  });
});
