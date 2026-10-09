import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Pool } from "pg";
import type { RequestContext } from "../../../builds/44-shared-platform-foundation/src/contracts";
import { ReconciliationControl } from "../../../builds/50-nova-reconciliation-recovery-control/src/reconciliation-control";
import { GovernedRecoveryExecution } from "../src/governed-recovery-execution";

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const tenantId = randomUUID();
const context: RequestContext = {
  contractVersion: "1.0", requestId: "build-51-request", correlationId: "build-51-correlation",
  tenantId, actor: { type: "user", reference: "human-recovery-reviewer-51" },
  authorizationDecisionReference: "authz://synthetic/build-51/approved",
};

suite("Build 51 NOVA governed recovery execution integration", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
  const reconciliation = new ReconciliationControl(pool, async () => true);

  beforeAll(async () => {
    const base = await readFile(resolve(process.cwd(), "builds/46-first-integration-pilot/sql/build_46_durable_execution.sql"), "utf8");
    const recon = await readFile(resolve(process.cwd(), "builds/50-nova-reconciliation-recovery-control/sql/build_50_reconciliation_control.sql"), "utf8");
    const recovery = await readFile(resolve(process.cwd(), "builds/51-nova-governed-recovery-execution/sql/build_51_governed_recovery_execution.sql"), "utf8");
    const client = await pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(480046)");
      await client.query(base);
      await client.query(recon);
      await client.query(recovery);
      await client.query("SELECT pg_advisory_unlock(480046)");
    } finally { client.release(); }
  });

  afterAll(async () => { await pool.end(); });

  async function makeResolvedCase(key: string, resolution: "downstream_not_executed" | "downstream_completed" | "manual_follow_up" = "downstream_not_executed") {
    await pool.query(
      `INSERT INTO nova_pilot_operations
        (tenant_id, operation_name, idempotency_key, request_fingerprint, original_request_id, status,
         result, downstream_reference, event_id, last_error_code)
       VALUES ($1::uuid, 'build_51_recovery_fixture', $2, 'synthetic-fingerprint', $2, 'reconciliation_required',
         $3::jsonb, $4, $5, 'OUTCOME_AMBIGUOUS')`,
      [tenantId, key, JSON.stringify({ status: "reconciliation_required", downstreamReference: `synthetic-ref-${key}`, eventId: `synthetic-event-${key}` }), `synthetic-ref-${key}`, `synthetic-event-${key}`],
    );
    const caseRow = await reconciliation.openFromOperation(context, { operationName: "build_51_recovery_fixture", idempotencyKey: key });
    await reconciliation.resolve(context, {
      caseId: caseRow.id, resolution,
      evidenceReference: `evidence://synthetic/build-51/${key}`,
      note: resolution === "downstream_not_executed" ? "Synthetic downstream lookup confirmed no effect." : "Synthetic reviewed resolution.",
    });
    return caseRow;
  }

  it("executes only after human authorization and returns the durable result idempotently", async () => {
    const caseRow = await makeResolvedCase("success");
    const adapter = vi.fn(async () => ({ downstreamReference: "synthetic-downstream-51", evidenceReference: "evidence://synthetic/51/completed" }));
    const runner = new GovernedRecoveryExecution(pool, async (_ctx, action) => action === "recovery.execute", adapter);
    const first = await runner.execute(context, { caseId: caseRow.id, idempotencyKey: "recover-success" });
    const replay = await runner.execute(context, { caseId: caseRow.id, idempotencyKey: "recover-success" });
    expect(first.status).toBe("completed");
    expect(first.downstream_reference).toBe("synthetic-downstream-51");
    expect(replay.id).toBe(first.id);
    expect(adapter).toHaveBeenCalledTimes(1);
    const audit = await pool.query("SELECT action FROM nova_pilot_recovery_execution_audit WHERE tenant_id = $1::uuid AND execution_id = $2::uuid ORDER BY id", [tenantId, first.id]);
    expect(audit.rows.map(row => row.action)).toEqual(["recovery_reserved", "recovery_completed"]);
  });

  it("fails closed without human identity, authorization reference, or authorization", async () => {
    const caseRow = await makeResolvedCase("auth");
    const adapter = vi.fn(async () => ({ downstreamReference: "x", evidenceReference: "y" }));
    const runner = new GovernedRecoveryExecution(pool, async () => false, adapter);
    await expect(runner.execute({ ...context, actor: { type: "agent", reference: "mr-nova" } }, { caseId: caseRow.id, idempotencyKey: "auth-agent" })).rejects.toThrow("RECOVERY_HUMAN_ACTOR_REQUIRED");
    await expect(runner.execute({ ...context, authorizationDecisionReference: undefined }, { caseId: caseRow.id, idempotencyKey: "auth-no-ref" })).rejects.toThrow("RECOVERY_AUTHORIZATION_REFERENCE_REQUIRED");
    await expect(runner.execute(context, { caseId: caseRow.id, idempotencyKey: "auth-denied" })).rejects.toThrow("RECOVERY_FORBIDDEN");
    expect(adapter).not.toHaveBeenCalled();
  });

  it("rejects unresolved cases and resolutions other than downstream_not_executed", async () => {
    const completedCase = await makeResolvedCase("already-done", "downstream_completed");
    const manualCase = await makeResolvedCase("manual", "manual_follow_up");
    const runner = new GovernedRecoveryExecution(pool, async () => true, async () => ({ downstreamReference: "x", evidenceReference: "y" }));
    await expect(runner.execute(context, { caseId: completedCase.id, idempotencyKey: "do-not-repeat" })).rejects.toThrow("RECOVERY_RESOLUTION_NOT_EXECUTABLE");
    await expect(runner.execute(context, { caseId: manualCase.id, idempotencyKey: "manual-follow-up" })).rejects.toThrow("RECOVERY_RESOLUTION_NOT_EXECUTABLE");
    await expect(runner.execute({ ...context, tenantId: randomUUID() }, { caseId: completedCase.id, idempotencyKey: "cross-tenant" })).rejects.toThrow("RECOVERY_CASE_NOT_FOUND");
  });

  it("moves an ambiguous adapter outcome to reconciliation and blocks blind replay", async () => {
    const caseRow = await makeResolvedCase("ambiguous");
    const adapter = vi.fn(async () => { throw new Error("socket closed after possible downstream commit"); });
    const runner = new GovernedRecoveryExecution(pool, async () => true, adapter);
    await expect(runner.execute(context, { caseId: caseRow.id, idempotencyKey: "recover-ambiguous" })).rejects.toThrow("RECOVERY_OUTCOME_AMBIGUOUS_NO_BLIND_RETRY");
    const persisted = await pool.query("SELECT status, failure_code FROM nova_pilot_recovery_executions WHERE tenant_id = $1::uuid AND case_id = $2::uuid", [tenantId, caseRow.id]);
    expect(persisted.rows[0].status).toBe("reconciliation_required");
    expect(persisted.rows[0].failure_code).toContain("socket closed");
    await expect(runner.execute(context, { caseId: caseRow.id, idempotencyKey: "recover-ambiguous" })).rejects.toThrow("RECOVERY_OUTCOME_AMBIGUOUS_NO_BLIND_RETRY");
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it("prevents concurrent distinct recovery keys for the same case", async () => {
    const caseRow = await makeResolvedCase("concurrency");
    let release!: (value: { downstreamReference: string; evidenceReference: string }) => void;
    const waiting = new Promise<{ downstreamReference: string; evidenceReference: string }>(resolvePromise => { release = resolvePromise; });
    const adapter = vi.fn(async () => waiting);
    const runner = new GovernedRecoveryExecution(pool, async () => true, adapter);
    const first = runner.execute(context, { caseId: caseRow.id, idempotencyKey: "concurrent-a" });
    // Wait until the durable reservation exists before starting the second distinct key.
    for (let i = 0; i < 30; i++) {
      const check = await pool.query("SELECT id FROM nova_pilot_recovery_executions WHERE tenant_id = $1::uuid AND case_id = $2::uuid AND status = 'executing'", [tenantId, caseRow.id]);
      if (check.rowCount) break;
      await new Promise(resolvePromise => setTimeout(resolvePromise, 10));
    }
    await expect(runner.execute(context, { caseId: caseRow.id, idempotencyKey: "concurrent-b" })).rejects.toThrow("RECOVERY_ALREADY_IN_PROGRESS");
    release({ downstreamReference: "synthetic-concurrent", evidenceReference: "evidence://synthetic/concurrent" });
    expect((await first).status).toBe("completed");
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it("keeps the execution audit append-only", async () => {
    const caseRow = await makeResolvedCase("audit");
    const runner = new GovernedRecoveryExecution(pool, async () => true, async () => ({ downstreamReference: "synthetic-audit", evidenceReference: "evidence://synthetic/audit" }));
    const result = await runner.execute(context, { caseId: caseRow.id, idempotencyKey: "audit-key" });
    const entry = await pool.query("SELECT id FROM nova_pilot_recovery_execution_audit WHERE tenant_id = $1::uuid AND execution_id = $2::uuid ORDER BY id LIMIT 1", [tenantId, result.id]);
    await expect(pool.query("UPDATE nova_pilot_recovery_execution_audit SET details = '{}'::jsonb WHERE id = $1", [entry.rows[0].id])).rejects.toThrow("RECOVERY_EXECUTION_AUDIT_APPEND_ONLY");
  });
});
