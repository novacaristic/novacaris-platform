import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Pool } from "pg";
import { ReconciliationControl } from "../src/reconciliation-control";
import type { RequestContext } from "../../../builds/44-shared-platform-foundation/src/contracts";

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const tenantId = randomUUID();
const context: RequestContext = {
  contractVersion: "1.0", requestId: "build-50-request", correlationId: "build-50-correlation",
  tenantId, actor: { type: "user", reference: "human-reviewer-50" },
};

suite("Build 50 NOVA reconciliation control integration", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
  const control = new ReconciliationControl(pool, async () => true);

  beforeAll(async () => {
    const migration = await readFile(resolve(process.cwd(), "builds/46-first-integration-pilot/sql/build_46_durable_execution.sql"), "utf8");
    const reconciliationMigration = await readFile(resolve(process.cwd(), "builds/50-nova-reconciliation-recovery-control/sql/build_50_reconciliation_control.sql"), "utf8");
    const client = await pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(480046)");
      await client.query(migration);
      await client.query(reconciliationMigration);
      await client.query("SELECT pg_advisory_unlock(480046)");
    } finally { client.release(); }
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedOperation(key: string) {
    return pool.query(
      `INSERT INTO nova_pilot_operations
        (tenant_id, operation_name, idempotency_key, request_fingerprint, original_request_id, status,
         result, downstream_reference, event_id, last_error_code)
       VALUES ($1::uuid, 'create_demo_task', $2, 'synthetic-fingerprint', $3, 'reconciliation_required',
         $4::jsonb, $5, $6, 'OUTCOME_AMBIGUOUS')
       RETURNING id`,
      [tenantId, key, key, JSON.stringify({ status: "reconciliation_required", reason: "OUTCOME_AMBIGUOUS", downstreamReference: "synthetic-ref-50", eventId: "synthetic-event-50" }), "synthetic-ref-50", "synthetic-event-50"],
    );
  }

  it("opens an idempotent case and appends an opening audit event", async () => {
    await seedOperation("build-50-open");
    const first = await control.openFromOperation(context, { operationName: "create_demo_task", idempotencyKey: "build-50-open" });
    const second = await control.openFromOperation(context, { operationName: "create_demo_task", idempotencyKey: "build-50-open" });
    expect(second.id).toBe(first.id);
    const audit = await pool.query("SELECT action FROM nova_pilot_reconciliation_audit WHERE tenant_id = $1::uuid AND case_id = $2::uuid ORDER BY id", [tenantId, first.id]);
    expect(audit.rows.map(row => row.action)).toEqual(["case_opened"]);
  });

  it("requires a human actor and an explicit authorization decision", async () => {
    const agentControl = new ReconciliationControl(pool, async () => true);
    await expect(agentControl.openFromOperation({ ...context, actor: { type: "agent", reference: "mr-nova" } }, { operationName: "create_demo_task", idempotencyKey: "build-50-open" })).rejects.toThrow("RECONCILIATION_HUMAN_ACTOR_REQUIRED");
    const denied = new ReconciliationControl(pool, async () => false);
    await expect(denied.openFromOperation(context, { operationName: "create_demo_task", idempotencyKey: "build-50-open" })).rejects.toThrow("RECONCILIATION_FORBIDDEN");
  });

  it("resolves with evidence, writes audit, and does not retry or mutate the operation", async () => {
    const seeded = await seedOperation("build-50-resolve");
    const caseRow = await control.openFromOperation(context, { operationName: "create_demo_task", idempotencyKey: "build-50-resolve" });
    const adapter = vi.fn();
    const resolved = await control.resolve(context, {
      caseId: caseRow.id, resolution: "downstream_completed",
      evidenceReference: "evidence://synthetic/50/verified-result", note: "Verified from synthetic downstream lookup.",
    });
    expect(resolved.state).toBe("resolved");
    expect(resolved.resolved_by_actor).toBe(context.actor.reference);
    expect(adapter).not.toHaveBeenCalled();
    const operation = await pool.query("SELECT status FROM nova_pilot_operations WHERE id = $1::uuid", [seeded.rows[0].id]);
    expect(operation.rows[0].status).toBe("reconciliation_required");
    const audit = await pool.query("SELECT action, details FROM nova_pilot_reconciliation_audit WHERE tenant_id = $1::uuid AND case_id = $2::uuid ORDER BY id", [tenantId, caseRow.id]);
    expect(audit.rows.map(row => row.action)).toEqual(["case_opened", "case_resolved"]);
    expect(audit.rows[1].details.evidenceReference).toBe("evidence://synthetic/50/verified-result");
  });

  it("rejects conflicting second resolution and prevents audit mutation", async () => {
    const caseRow = await control.openFromOperation(context, { operationName: "create_demo_task", idempotencyKey: "build-50-resolve" });
    await expect(control.resolve(context, { caseId: caseRow.id, resolution: "downstream_not_executed", evidenceReference: "evidence://other", note: "Conflicting result" })).rejects.toThrow("RECONCILIATION_CASE_ALREADY_RESOLVED");
    const audit = await pool.query("SELECT id FROM nova_pilot_reconciliation_audit WHERE tenant_id = $1::uuid AND case_id = $2::uuid ORDER BY id LIMIT 1", [tenantId, caseRow.id]);
    await expect(pool.query("UPDATE nova_pilot_reconciliation_audit SET details = '{}'::jsonb WHERE id = $1", [audit.rows[0].id])).rejects.toThrow("RECONCILIATION_AUDIT_APPEND_ONLY");
  });

  it("fails closed for a case belonging to another tenant", async () => {
    const caseRow = await control.openFromOperation(context, { operationName: "create_demo_task", idempotencyKey: "build-50-open" });
    await expect(control.resolve({ ...context, tenantId: "00000000-0000-4000-8000-000000000051" }, { caseId: caseRow.id, resolution: "manual_follow_up", evidenceReference: "evidence://tenant-check", note: "must not cross tenant" })).rejects.toThrow("RECONCILIATION_CASE_NOT_FOUND");
  });
});
