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

  it("claims and delivers outbox events from PostgreSQL, then persists delivery state", async () => {
    const store = new PostgresOutboxStore(pool);
    const delivery = await dispatchOutboxBatch({
      store,
      workerId: "integration-worker-1",
      limit: 10,
      leaseSeconds: 30,
      deliver: async (deliveredEvent) => {
        expect(deliveredEvent.eventId).toBe(event.eventId);
      },
    });
    expect(delivery.claimed).toBe(1);
    expect(delivery.delivered).toBe(1);
    const row = await secondPool.query(
      "SELECT status, attempt_count, lease_owner, lease_until FROM nova_pilot_outbox WHERE tenant_id = $1::uuid AND event_id = $2",
      [tenantId, event.eventId],
    );
    expect(row.rows[0].status).toBe("delivered");
    expect(row.rows[0].attempt_count).toBe(1);
    expect(row.rows[0].lease_owner).toBeNull();
    expect(row.rows[0].lease_until).toBeNull();
  });

  it("schedules a failed delivery for retry with bounded attempts", async () => {
    const retryEvent: PlatformEvent = { ...event, eventId: "integration-event-retry" };
    await pool.query(
      `INSERT INTO nova_pilot_outbox
        (tenant_id, operation_id, event_id, event_type, event_version, correlation_id, payload)
       SELECT tenant_id, id, $2, $3, $4, $5, $6::jsonb
         FROM nova_pilot_operations
        WHERE tenant_id = $1::uuid AND operation_name = $7 AND idempotency_key = $8`,
      [tenantId, retryEvent.eventId, retryEvent.eventType, retryEvent.eventVersion, retryEvent.correlationId, JSON.stringify(retryEvent), operationName, idempotencyKey],
    );
    const summary = await dispatchOutboxBatch({
      store: new PostgresOutboxStore(pool),
      workerId: "integration-worker-retry",
      maxAttempts: 2,
      deliver: async () => { throw new Error("synthetic sink failure"); },
    });
    expect(summary.retryScheduled).toBe(1);
    const row = await pool.query(
      "SELECT status, attempt_count, last_error, lease_owner, lease_until FROM nova_pilot_outbox WHERE tenant_id = $1::uuid AND event_id = $2",
      [tenantId, retryEvent.eventId],
    );
    expect(row.rows[0].status).toBe("pending");
    expect(row.rows[0].attempt_count).toBe(1);
    expect(row.rows[0].last_error).toBe("synthetic sink failure");
    expect(row.rows[0].lease_owner).toBeNull();
    expect(row.rows[0].lease_until).toBeNull();
    // Keep this retry fixture from being claimed by later recovery tests.
    await pool.query("UPDATE nova_pilot_outbox SET status = 'dead_letter' WHERE tenant_id = $1::uuid AND event_id = $2", [tenantId, retryEvent.eventId]);
  });

  it("recovers an expired worker lease without re-running the original operation", async () => {
    const recoveryEvent: PlatformEvent = { ...event, eventId: "integration-event-expired-lease" };
    await pool.query("INSERT INTO nova_pilot_outbox (tenant_id, operation_id, event_id, event_type, event_version, correlation_id, payload) SELECT tenant_id, id, $2, $3, $4, $5, $6::jsonb FROM nova_pilot_operations WHERE tenant_id = $1::uuid AND operation_name = $7 AND idempotency_key = $8", [tenantId, recoveryEvent.eventId, recoveryEvent.eventType, recoveryEvent.eventVersion, recoveryEvent.correlationId, JSON.stringify(recoveryEvent), operationName, idempotencyKey]);
    const store = new PostgresOutboxStore(pool);
    const firstClaim = await store.claimBatch("crashed-worker", 10, 30);
    expect(firstClaim.map(row => row.event_id)).toContain(recoveryEvent.eventId);
    const claimed = firstClaim.find(row => row.event_id === recoveryEvent.eventId)!;
    await pool.query("UPDATE nova_pilot_outbox SET lease_until = now() - interval '1 second' WHERE id = $1::uuid", [claimed.id]);
    const secondClaim = await store.claimBatch("recovery-worker", 10, 30);
    const recovered = secondClaim.find(row => row.event_id === recoveryEvent.eventId);
    expect(recovered).toBeDefined();
    expect(recovered?.lease_owner).toBe("recovery-worker");
    expect(recovered?.attempt_count).toBe(2);
    expect(recovered?.event_id).toBe(recoveryEvent.eventId);
    const originalOperation = await pool.query("SELECT status, result FROM nova_pilot_operations WHERE tenant_id = $1::uuid AND operation_name = $2 AND idempotency_key = $3", [tenantId, operationName, idempotencyKey]);
    expect(originalOperation.rows[0].status).toBe("completed");
    expect(originalOperation.rows[0].result.downstreamReference).toBe("synthetic-downstream-001");
  });

  it("moves an event to dead-letter after the configured retry limit", async () => {
    const deadLetterEvent: PlatformEvent = { ...event, eventId: "integration-event-dead-letter" };
    await pool.query("INSERT INTO nova_pilot_outbox (tenant_id, operation_id, event_id, event_type, event_version, correlation_id, payload) SELECT tenant_id, id, $2, $3, $4, $5, $6::jsonb FROM nova_pilot_operations WHERE tenant_id = $1::uuid AND operation_name = $7 AND idempotency_key = $8", [tenantId, deadLetterEvent.eventId, deadLetterEvent.eventType, deadLetterEvent.eventVersion, deadLetterEvent.correlationId, JSON.stringify(deadLetterEvent), operationName, idempotencyKey]);
    const store = new PostgresOutboxStore(pool);
    const first = await dispatchOutboxBatch({ store, workerId: "dead-letter-worker-1", maxAttempts: 2, deliver: async () => { throw new Error("synthetic repeated failure"); } });
    expect(first.retryScheduled).toBe(1);
    await pool.query("UPDATE nova_pilot_outbox SET next_attempt_at = now() - interval '1 second' WHERE tenant_id = $1::uuid AND event_id = $2", [tenantId, deadLetterEvent.eventId]);
    const second = await dispatchOutboxBatch({ store, workerId: "dead-letter-worker-2", maxAttempts: 2, deliver: async () => { throw new Error("synthetic repeated failure"); } });
    expect(second.deadLettered).toBe(1);
    const row = await pool.query("SELECT status, attempt_count, last_error, lease_owner, lease_until FROM nova_pilot_outbox WHERE tenant_id = $1::uuid AND event_id = $2", [tenantId, deadLetterEvent.eventId]);
    expect(row.rows[0].status).toBe("dead_letter");
    expect(row.rows[0].attempt_count).toBe(2);
    expect(row.rows[0].last_error).toBe("synthetic repeated failure");
    expect(row.rows[0].lease_owner).toBeNull();
    expect(row.rows[0].lease_until).toBeNull();
  });

});
