import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { PostgresOutboxStore } from "../../46-first-integration-pilot/src/postgres-outbox-dispatcher";

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const tenantId = "00000000-0000-4000-8000-000000000049";
const operationName = "build_49_recovery_fixture";

suite("Build 49 NOVA crash-window and concurrent-worker recovery proof", () => {
  const poolA = new Pool({ connectionString: databaseUrl, max: 4 });
  const poolB = new Pool({ connectionString: databaseUrl, max: 4 });

  beforeAll(async () => {
    const migration = await readFile(resolve(process.cwd(), "builds/46-first-integration-pilot/sql/build_46_durable_execution.sql"), "utf8");
    const client = await poolA.connect();
    try {
      await client.query("SELECT pg_advisory_lock(480046)");
      await client.query(migration);
      await client.query("SELECT pg_advisory_unlock(480046)");
    } finally {
      client.release();
    }
    await poolA.query("DELETE FROM nova_pilot_outbox WHERE tenant_id = $1::uuid", [tenantId]);
    await poolA.query("DELETE FROM nova_pilot_operations WHERE tenant_id = $1::uuid", [tenantId]);
  });

  afterAll(async () => {
    await poolA.query("DELETE FROM nova_pilot_outbox WHERE tenant_id = $1::uuid", [tenantId]);
    await poolA.query("DELETE FROM nova_pilot_operations WHERE tenant_id = $1::uuid", [tenantId]);
    await poolA.end();
    await poolB.end();
  });

  async function seed(eventId: string): Promise<string> {
    const key = `build-49-${eventId}`;
    const operation = await poolA.query<{ id: string }>(
      `INSERT INTO nova_pilot_operations
        (tenant_id, operation_name, idempotency_key, request_fingerprint, original_request_id, status)
       VALUES ($1::uuid, $2, $3, $4, $5, 'completed')
       RETURNING id`,
      [tenantId, operationName, key, JSON.stringify({ eventId }), key],
    );
    const payload = {
      eventId, eventType: "pilot.recovery.proof", eventVersion: "1.0",
      occurredAt: new Date().toISOString(), tenantId,
      actorReference: "synthetic-build-49-actor", correlationId: `corr-${eventId}`,
      payload: { synthetic: true, build: 49 },
    };
    const outbox = await poolA.query<{ id: string }>(
      `INSERT INTO nova_pilot_outbox
        (tenant_id, operation_id, event_id, event_type, event_version, correlation_id, payload)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb)
       RETURNING id`,
      [tenantId, operation.rows[0].id, eventId, payload.eventType, payload.eventVersion, payload.correlationId, JSON.stringify(payload)],
    );
    return outbox.rows[0].id;
  }

  it("allows only one of two concurrent workers to claim a single event", async () => {
    const eventId = "build-49-concurrent-claim";
    await seed(eventId);
    const [left, right] = await Promise.all([
      new PostgresOutboxStore(poolA).claimBatch("build-49-worker-a", 1, 30),
      new PostgresOutboxStore(poolB).claimBatch("build-49-worker-b", 1, 30),
    ]);
    const claims = [...left, ...right].filter(row => row.event_id === eventId);
    expect(claims).toHaveLength(1);
    expect(["build-49-worker-a", "build-49-worker-b"]).toContain(claims[0].lease_owner);
    const persisted = await poolB.query(
      "SELECT status, lease_owner, attempt_count FROM nova_pilot_outbox WHERE tenant_id = $1::uuid AND event_id = $2",
      [tenantId, eventId],
    );
    expect(persisted.rows[0].status).toBe("delivering");
    expect(persisted.rows[0].attempt_count).toBe(1);
  });

  it("proves the sink-success/mark-delivered crash window and idempotent consumer recovery", async () => {
    const eventId = "build-49-crash-window";
    const outboxId = await seed(eventId);
    const storeA = new PostgresOutboxStore(poolA);
    const storeB = new PostgresOutboxStore(poolB);
    const first = await storeA.claimBatch("crashed-worker", 1, 30);
    expect(first.map(row => row.event_id)).toContain(eventId);

    // The sink applies its business effect, but the worker crashes before marking the outbox row delivered.
    const seenEventIds = new Set<string>();
    let sinkAttempts = 0;
    let appliedEffects = 0;
    const idempotentSink = async (id: string) => {
      sinkAttempts += 1;
      if (!seenEventIds.has(id)) {
        seenEventIds.add(id);
        appliedEffects += 1;
      }
    };
    await idempotentSink(eventId);

    await poolA.query("UPDATE nova_pilot_outbox SET lease_until = now() - interval '1 second' WHERE id = $1::uuid", [outboxId]);
    const recovered = await storeB.claimBatch("recovery-worker", 1, 30);
    expect(recovered.map(row => row.event_id)).toContain(eventId);
    await idempotentSink(eventId);
    await storeB.markDelivered(outboxId, "recovery-worker");

    expect(sinkAttempts).toBe(2);
    expect(appliedEffects).toBe(1);
    const row = await poolA.query(
      "SELECT status, attempt_count, lease_owner FROM nova_pilot_outbox WHERE id = $1::uuid",
      [outboxId],
    );
    expect(row.rows[0]).toMatchObject({ status: "delivered", attempt_count: 2, lease_owner: null });
  });

  it("rejects stale-worker completion after an expired lease is reassigned", async () => {
    const eventId = "build-49-stale-worker";
    const outboxId = await seed(eventId);
    const oldStore = new PostgresOutboxStore(poolA);
    const newStore = new PostgresOutboxStore(poolB);
    const first = await oldStore.claimBatch("old-worker", 1, 30);
    expect(first.map(row => row.event_id)).toContain(eventId);
    await poolA.query("UPDATE nova_pilot_outbox SET lease_until = now() - interval '1 second' WHERE id = $1::uuid", [outboxId]);
    const second = await newStore.claimBatch("new-worker", 1, 30);
    expect(second.map(row => row.event_id)).toContain(eventId);
    await expect(oldStore.markDelivered(outboxId, "old-worker")).rejects.toThrow("OUTBOX_LEASE_LOST");
    await newStore.markDelivered(outboxId, "new-worker");
    const row = await poolA.query("SELECT status, lease_owner FROM nova_pilot_outbox WHERE id = $1::uuid", [outboxId]);
    expect(row.rows[0]).toMatchObject({ status: "delivered", lease_owner: null });
  });
});
