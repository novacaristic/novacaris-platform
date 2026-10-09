import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { PostgresPilotOperationStore } from "../src/postgres-operation-store";
import { dispatchOutboxBatch, PostgresOutboxStore } from "../src/postgres-outbox-dispatcher";
import type { PilotOperation } from "../src/pilot";
import type { PlatformEvent } from "../../44-shared-platform-foundation/src/contracts";

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const tenantId = "00000000-0000-4000-8000-000000000001";
const operationName = "create_demo_task";
const idempotencyKey = "integration-key-001";
const scope = `${tenantId}:${operationName}:${idempotencyKey}`;

const operation: PilotOperation = {
  scope,
  tenantId,
  operation: operationName,
  idempotencyKey,
  fingerprint: JSON.stringify({ fixtureId: "integration-fixture-001" }),
  requestId: "integration-request-001",
  status: "in_progress",
};

const event: PlatformEvent = {
  eventId: "integration-event-001",
  eventType: "pilot.operation.completed",
  eventVersion: "1.0",
  occurredAt: "2026-10-08T12:00:00.000Z",
  tenantId,
  actorReference: "synthetic-integration-actor",
  correlationId: "integration-correlation-001",
  idempotencyKey,
  payload: { synthetic: true },
};

suite("Build 46 live PostgreSQL integration", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 8 });
  const secondPool = new Pool({ connectionString: databaseUrl, max: 4 });

  beforeAll(async () => {
    const migration = await readFile(resolve(process.cwd(), "builds/46-first-integration-pilot/sql/build_46_durable_execution.sql"), "utf8");
    await pool.query(migration);
    await pool.query("DELETE FROM nova_pilot_outbox WHERE tenant_id = $1::uuid", [tenantId]);
    await pool.query("DELETE FROM nova_pilot_operations WHERE tenant_id = $1::uuid", [tenantId]);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM nova_pilot_outbox WHERE tenant_id = $1::uuid", [tenantId]);
    await pool.query("DELETE FROM nova_pilot_operations WHERE tenant_id = $1::uuid", [tenantId]);
    await pool.end();
    await secondPool.end();
  });

  it("allows exactly one reservation for concurrent requests sharing an idempotency key", async () => {
    const store = new PostgresPilotOperationStore(pool);
    const results = await Promise.all([
      store.reserve(operation),
      store.reserve({ ...operation, requestId: "integration-request-002" }),
    ]);
    expect(results.filter(result => result.kind === "reserved")).toHaveLength(1);
    expect(results.filter(result => result.kind === "existing")).toHaveLength(1);
    const count = await pool.query(
      "SELECT count(*)::int AS count FROM nova_pilot_operations WHERE tenant_id = $1::uuid AND operation_name = $2 AND idempotency_key = $3",
      [tenantId, operationName, idempotencyKey],
    );
    expect(count.rows[0].count).toBe(1);
  });

  it("commits operation completion and outbox event together and reads it from a separate pool", async () => {
    const store = new PostgresPilotOperationStore(pool);
    const result = { status: "completed" as const, downstreamReference: "synthetic-downstream-001", eventId: event.eventId };
    await store.completeWithOutbox(scope, result, event);

    const persisted = await secondPool.query(
      `SELECT o.status, o.result, b.event_id, b.status AS outbox_status, b.payload
         FROM nova_pilot_operations o
         JOIN nova_pilot_outbox b ON b.operation_id = o.id
        WHERE o.tenant_id = $1::uuid AND o.operation_name = $2 AND o.idempotency_key = $3`,
      [tenantId, operationName, idempotencyKey],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0].status).toBe("completed");
    expect(persisted.rows[0].result.downstreamReference).toBe("synthetic-downstream-001");
    expect(persisted.rows[0].event_id).toBe(event.eventId);
    expect(persisted.rows[0].outbox_status).toBe("pending");
    expect(persisted.rows[0].payload.payload.synthetic).toBe(true);
  });

  it("rejects changed payload fingerprints for an existing key", async () => {
    const store = new PostgresPilotOperationStore(pool);
    const conflict = await store.reserve({ ...operation, fingerprint: "different-fingerprint" });
    expect(conflict).toEqual({ kind: "fingerprint_conflict" });
  });

  it("does not leave partial completion when the outbox insert violates a uniqueness constraint", async () => {
    const otherKey = "integration-rollback-key";
    const otherScope = `${tenantId}:${operationName}:${otherKey}`;
    const otherOperation: PilotOperation = { ...operation, scope: otherScope, idempotencyKey: otherKey, requestId: "integration-request-rollback" };
    const store = new PostgresPilotOperationStore(pool);
    await store.reserve(otherOperation);
    // Reuse an event ID already attached to the first operation; the tenant/event
    // unique constraint forces the second transaction to roll back.
    await expect(store.completeWithOutbox(
      otherScope,
      { status: "completed", downstreamReference: "must-rollback", eventId: event.eventId },
      event,
    )).rejects.toThrow();

    const row = await pool.query(
      "SELECT status FROM nova_pilot_operations WHERE tenant_id = $1::uuid AND operation_name = $2 AND idempotency_key = $3",
      [tenantId, operationName, otherKey],
    );
    expect(row.rows[0].status).toBe("in_progress");
    await pool.query("DELETE FROM nova_pilot_operations WHERE tenant_id = $1::uuid AND operation_name = $2 AND idempotency_key = $3", [tenantId, operationName, otherKey]);
  });
});
