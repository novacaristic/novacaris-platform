import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { FirstIntegrationPilot, type PilotRequest } from "../../46-first-integration-pilot/src/pilot";
import { PostgresPilotOperationStore } from "../../46-first-integration-pilot/src/postgres-operation-store";
import { dispatchOutboxBatch, PostgresOutboxStore } from "../../46-first-integration-pilot/src/postgres-outbox-dispatcher";
import type { RequestContext, PlatformEvent } from "../../44-shared-platform-foundation/src/contracts";

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const tenantId = "00000000-0000-4000-8000-000000000048";
const operation = "create_demo_task";
const idempotencyKey = "build-48-e2e-key-001";
const scope = `${tenantId}:${operation}:${idempotencyKey}`;

const context: RequestContext = {
  contractVersion: "1.0",
  requestId: "build-48-request-001",
  correlationId: "build-48-correlation-001",
  tenantId,
  actor: { type: "user", reference: "synthetic-build-48-actor" },
};

const request: PilotRequest = {
  requestId: context.requestId,
  idempotencyKey,
  operation,
  tenantId,
  payload: { title: "Build 48 synthetic task", fixtureId: "build-48-fixture-001" },
};

suite("Build 48 NOVA end-to-end PostgreSQL recovery proof", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 8 });
  const observerPool = new Pool({ connectionString: databaseUrl, max: 4 });

  beforeAll(async () => {
    const migration = await readFile(resolve(process.cwd(), "builds/46-first-integration-pilot/sql/build_46_durable_execution.sql"), "utf8");
    // Both integration suites may initialize the same PostgreSQL service in parallel.
    // Serialize DDL setup with a session-level advisory lock to avoid duplicate type creation.
    const migrationClient = await pool.connect();
    try {
      await migrationClient.query("SELECT pg_advisory_lock(480046)");
      await migrationClient.query(migration);
      await migrationClient.query("SELECT pg_advisory_unlock(480046)");
    } finally {
      migrationClient.release();
    }
    await pool.query("DELETE FROM nova_pilot_outbox WHERE tenant_id = $1::uuid", [tenantId]);
    await pool.query("DELETE FROM nova_pilot_operations WHERE tenant_id = $1::uuid", [tenantId]);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM nova_pilot_outbox WHERE tenant_id = $1::uuid", [tenantId]);
    await pool.query("DELETE FROM nova_pilot_operations WHERE tenant_id = $1::uuid", [tenantId]);
    await pool.end();
    await observerPool.end();
  });

  it("executes the synthetic operation once, commits result plus outbox, survives pilot recreation, and dispatches the durable event", async () => {
    const store = new PostgresPilotOperationStore(pool);
    const adapterExecute = vi.fn(async () => ({ downstreamReference: "synthetic-build-48-downstream-001" }));
    const recordEvent = vi.fn(async (_event: PlatformEvent) => {});
    const pilot = new FirstIntegrationPilot({
      policyAllows: async (_context, operationName) => operationName === operation,
      adapterExecute,
      recordEvent,
      store,
    });

    const first = await pilot.execute(context, request);
    expect(first).toMatchObject({ status: "completed", downstreamReference: "synthetic-build-48-downstream-001" });
    expect(adapterExecute).toHaveBeenCalledTimes(1);

    const persisted = await observerPool.query(
      `SELECT o.status, o.result, b.status AS outbox_status, b.payload
         FROM nova_pilot_operations o
         JOIN nova_pilot_outbox b ON b.operation_id = o.id
        WHERE o.tenant_id = $1::uuid AND o.operation_name = $2 AND o.idempotency_key = $3`,
      [tenantId, operation, idempotencyKey],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0].status).toBe("completed");
    expect(persisted.rows[0].result.downstreamReference).toBe("synthetic-build-48-downstream-001");
    expect(persisted.rows[0].outbox_status).toBe("pending");
    expect(persisted.rows[0].payload.payload.fixtureId).toBe(request.payload.fixtureId);

    // Simulate a process restart by constructing a fresh orchestrator and store adapter.
    const restartedAdapter = vi.fn(async () => ({ downstreamReference: "must-not-execute-again" }));
    const restartedPilot = new FirstIntegrationPilot({
      policyAllows: async () => true,
      adapterExecute: restartedAdapter,
      recordEvent: async () => {},
      store: new PostgresPilotOperationStore(observerPool),
    });
    const duplicate = await restartedPilot.execute(
      { ...context, requestId: "build-48-request-replay" },
      { ...request, requestId: "build-48-request-replay" },
    );
    expect(duplicate).toEqual({ status: "duplicate", originalRequestId: request.requestId });
    expect(restartedAdapter).not.toHaveBeenCalled();

    const delivered: PlatformEvent[] = [];
    const dispatch = await dispatchOutboxBatch({
      store: new PostgresOutboxStore(pool),
      workerId: "build-48-worker-001",
      limit: 20,
      leaseSeconds: 30,
      deliver: async (event) => { delivered.push(event); },
    });
    expect(dispatch.claimed).toBe(1);
    expect(dispatch.delivered).toBe(1);
    expect(delivered).toHaveLength(1);
    expect(delivered[0].eventId).toBe((first as Extract<typeof first, { status: "completed" }>).eventId);

    const finalState = await observerPool.query(
      `SELECT o.status, b.status AS outbox_status, b.attempt_count
         FROM nova_pilot_operations o
         JOIN nova_pilot_outbox b ON b.operation_id = o.id
        WHERE o.tenant_id = $1::uuid AND o.operation_name = $2 AND o.idempotency_key = $3`,
      [tenantId, operation, idempotencyKey],
    );
    expect(finalState.rows[0]).toMatchObject({ status: "completed", outbox_status: "delivered", attempt_count: 1 });
    expect(adapterExecute).toHaveBeenCalledTimes(1);
  });

  it("denies policy-rejected work before invoking the downstream adapter", async () => {
    const deniedKey = "build-48-policy-denial-key";
    const adapterExecute = vi.fn(async () => ({ downstreamReference: "must-not-exist" }));
    const pilot = new FirstIntegrationPilot({
      policyAllows: async () => false,
      adapterExecute,
      recordEvent: async () => {},
      store: new PostgresPilotOperationStore(pool),
    });
    const result = await pilot.execute(context, { ...request, idempotencyKey: deniedKey, requestId: "build-48-denied-request" });
    expect(result).toEqual({ status: "denied", reason: "POLICY_DENIED" });
    expect(adapterExecute).not.toHaveBeenCalled();
    const row = await observerPool.query(
      "SELECT status FROM nova_pilot_operations WHERE tenant_id = $1::uuid AND operation_name = $2 AND idempotency_key = $3",
      [tenantId, operation, deniedKey],
    );
    expect(row.rows[0].status).toBe("denied");
  });

  it("fails closed on tenant-context mismatch before policy or downstream execution", async () => {
    const policyAllows = vi.fn(async () => true);
    const adapterExecute = vi.fn(async () => ({ downstreamReference: "must-not-exist" }));
    const pilot = new FirstIntegrationPilot({
      policyAllows,
      adapterExecute,
      recordEvent: async () => {},
      store: new PostgresPilotOperationStore(pool),
    });
    const result = await pilot.execute(context, { ...request, tenantId: "00000000-0000-4000-8000-000000000049", idempotencyKey: "build-48-tenant-mismatch" });
    expect(result).toEqual({ status: "denied", reason: "TENANT_CONTEXT_MISMATCH" });
    expect(policyAllows).not.toHaveBeenCalled();
    expect(adapterExecute).not.toHaveBeenCalled();
    const row = await observerPool.query(
      "SELECT count(*)::int AS count FROM nova_pilot_operations WHERE tenant_id = $1::uuid AND idempotency_key = $2",
      [tenantId, "build-48-tenant-mismatch"],
    );
    expect(row.rows[0].count).toBe(0);
  });
});
