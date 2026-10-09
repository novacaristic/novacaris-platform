import { describe, expect, it, vi } from "vitest";
import { dispatchOutboxBatch, PostgresOutboxStore, type OutboxRecord, type OutboxStore } from "../src/postgres-outbox-dispatcher";
import type { SqlClient, SqlPool, SqlResult } from "../src/postgres-operation-store";

function result<Row>(rows: Row[] = [], rowCount: number | null = rows.length): SqlResult<Row> {
  return { rows, rowCount };
}

function fakePool(query: (sql: string, values?: unknown[]) => Promise<SqlResult<any>>) {
  const client: SqlClient = { query: vi.fn(query), release: vi.fn() };
  const pool: SqlPool = { connect: vi.fn(async () => client) };
  return { pool, client };
}

const record: OutboxRecord = {
  id: "00000000-0000-4000-8000-000000000099",
  tenant_id: "00000000-0000-4000-8000-000000000001",
  operation_id: "00000000-0000-4000-8000-000000000098",
  event_id: "event-99",
  event_type: "pilot.operation.completed",
  event_version: "1.0",
  correlation_id: "corr-99",
  payload: {
    eventId: "event-99",
    eventType: "pilot.operation.completed",
    eventVersion: "1.0",
    occurredAt: "2026-10-08T12:00:00.000Z",
    tenantId: "00000000-0000-4000-8000-000000000001",
    actorReference: "synthetic-actor",
    correlationId: "corr-99",
    payload: { synthetic: true },
  },
  status: "delivering",
  attempt_count: 1,
  lease_owner: "worker-1",
};

describe("PostgresOutboxStore", () => {
  it("claims due rows with SKIP LOCKED and increments attempts", async () => {
    const { pool, client } = fakePool(async sql => {
      if (sql === "BEGIN" || sql === "COMMIT") return result();
      if (sql.includes("WITH candidates")) return result([record]);
      throw new Error("Unexpected SQL: " + sql);
    });
    const rows = await new PostgresOutboxStore(pool).claimBatch("worker-1", 10, 30);
    expect(rows).toEqual([record]);
    const claimSql = String((client.query as any).mock.calls.find((call: unknown[]) => String(call[0]).includes("WITH candidates"))[0]);
    expect(claimSql).toContain("FOR UPDATE SKIP LOCKED");
    expect(claimSql).toContain("attempt_count = outbox.attempt_count + 1");
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });

  it("rejects a completion update after lease ownership is lost", async () => {
    const { pool } = fakePool(async sql => {
      if (sql.includes("UPDATE nova_pilot_outbox")) return result([], 0);
      throw new Error("Unexpected SQL: " + sql);
    });
    await expect(new PostgresOutboxStore(pool).markDelivered(record.id, "worker-1")).rejects.toThrow("OUTBOX_LEASE_LOST");
  });

  it("bounds batch sizes and lease durations", async () => {
    const { pool } = fakePool(async () => result());
    const store = new PostgresOutboxStore(pool);
    await expect(store.claimBatch("worker", 0, 30)).rejects.toThrow("OUTBOX_BATCH_LIMIT_INVALID");
    await expect(store.claimBatch("worker", 10, 1)).rejects.toThrow("OUTBOX_LEASE_DURATION_INVALID");
  });
});

describe("dispatchOutboxBatch", () => {
  it("delivers events and marks successful records delivered", async () => {
    const store: OutboxStore = {
      claimBatch: vi.fn(async () => [record]),
      markDelivered: vi.fn(async () => {}),
      markDeliveryFailure: vi.fn(async () => "retry_scheduled" as const),
    };
    const deliver = vi.fn(async () => {});
    const summary = await dispatchOutboxBatch({ store, workerId: "worker-1", deliver });
    expect(summary).toEqual({ claimed: 1, delivered: 1, retryScheduled: 0, deadLettered: 0 });
    expect(deliver).toHaveBeenCalledWith(record.payload);
    expect(store.markDelivered).toHaveBeenCalledWith(record.id, "worker-1");
  });

  it("schedules retry for temporary failures and dead-letters exhausted deliveries", async () => {
    const records = [{ ...record, id: "event-a" }, { ...record, id: "event-b" }];
    const store: OutboxStore = {
      claimBatch: vi.fn(async () => records),
      markDelivered: vi.fn(async () => {}),
      markDeliveryFailure: vi.fn()
        .mockResolvedValueOnce("retry_scheduled")
        .mockResolvedValueOnce("dead_letter"),
    };
    const summary = await dispatchOutboxBatch({
      store,
      workerId: "worker-1",
      maxAttempts: 2,
      deliver: vi.fn(async () => { throw new Error("sink unavailable"); }),
    });
    expect(summary).toEqual({ claimed: 2, delivered: 0, retryScheduled: 1, deadLettered: 1 });
    expect(store.markDeliveryFailure).toHaveBeenCalledTimes(2);
  });
});
