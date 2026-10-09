import { describe, expect, it, vi } from "vitest";
import { PostgresPilotOperationStore, type SqlClient, type SqlPool, type SqlResult } from "../src/postgres-operation-store";
import type { PlatformEvent } from "../../44-shared-platform-foundation/src/contracts";
import type { PilotOperation } from "../src/pilot";

function result<Row>(rows: Row[] = [], rowCount: number | null = rows.length): SqlResult<Row> {
  return { rows, rowCount };
}

function operation(overrides: Partial<PilotOperation> = {}): PilotOperation {
  return {
    scope: "00000000-0000-4000-8000-000000000001:create_demo_task:idem-001",
    tenantId: "00000000-0000-4000-8000-000000000001",
    operation: "create_demo_task",
    idempotencyKey: "idem-001",
    fingerprint: "{\"fixtureId\":\"f-1\"}",
    requestId: "req-001",
    status: "in_progress",
    ...overrides,
  };
}

const event: PlatformEvent = {
  eventId: "event-001",
  eventType: "pilot.operation.completed",
  eventVersion: "1.0",
  occurredAt: "2026-10-08T12:00:00.000Z",
  tenantId: "00000000-0000-4000-8000-000000000001",
  actorReference: "synthetic-user",
  correlationId: "corr-001",
  idempotencyKey: "idem-001",
  payload: { requestId: "req-001" },
};

function poolFor(query: (sql: string, values?: unknown[]) => Promise<SqlResult<any>>) {
  const client: SqlClient = {
    query: vi.fn(query),
    release: vi.fn(),
  };
  const pool: SqlPool = { connect: vi.fn(async () => client) };
  return { pool, client };
}

describe("PostgresPilotOperationStore", () => {
  it("reserves an operation with a unique-key insert", async () => {
    const { pool, client } = poolFor(async (sql) => {
      if (sql === "BEGIN" || sql === "COMMIT") return result();
      if (sql.includes("INSERT INTO nova_pilot_operations")) return result([{ id: "operation-uuid" }]);
      throw new Error("Unexpected SQL: " + sql);
    });
    const store = new PostgresPilotOperationStore(pool);
    expect(await store.reserve(operation())).toEqual({ kind: "reserved" });
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("returns conflict when an existing key has a different fingerprint", async () => {
    const prior = {
      id: "operation-uuid",
      tenant_id: "00000000-0000-4000-8000-000000000001",
      operation_name: "create_demo_task",
      idempotency_key: "idem-001",
      request_fingerprint: "different-fingerprint",
      original_request_id: "req-original",
      status: "completed",
      result: { status: "completed", downstreamReference: "downstream-1", eventId: "event-1" },
    };
    const { pool } = poolFor(async (sql) => {
      if (sql === "BEGIN" || sql === "COMMIT") return result();
      if (sql.includes("INSERT INTO nova_pilot_operations")) return result([]);
      if (sql.includes("SELECT id, tenant_id")) return result([prior]);
      throw new Error("Unexpected SQL: " + sql);
    });
    expect(await new PostgresPilotOperationStore(pool).reserve(operation())).toEqual({ kind: "fingerprint_conflict" });
  });

  it("commits operation result and outbox insert in one transaction", async () => {
    const calls: string[] = [];
    const { pool } = poolFor(async (sql) => {
      calls.push(sql);
      if (sql === "BEGIN" || sql === "COMMIT") return result();
      if (sql.includes("SELECT id FROM nova_pilot_operations")) return result([{ id: "operation-uuid" }]);
      if (sql.includes("UPDATE nova_pilot_operations")) return result([], 1);
      if (sql.includes("INSERT INTO nova_pilot_outbox")) return result([], 1);
      throw new Error("Unexpected SQL: " + sql);
    });
    await new PostgresPilotOperationStore(pool).completeWithOutbox(
      operation().scope,
      { status: "completed", downstreamReference: "downstream-1", eventId: event.eventId },
      event,
    );
    expect(calls[0]).toBe("BEGIN");
    expect(calls.some(sql => sql.includes("UPDATE nova_pilot_operations"))).toBe(true);
    expect(calls.some(sql => sql.includes("INSERT INTO nova_pilot_outbox"))).toBe(true);
    expect(calls[calls.length - 1]).toBe("COMMIT");
  });

  it("rolls back when the outbox insert fails", async () => {
    const calls: string[] = [];
    const { pool } = poolFor(async (sql) => {
      calls.push(sql);
      if (sql === "BEGIN" || sql === "ROLLBACK") return result();
      if (sql.includes("SELECT id FROM nova_pilot_operations")) return result([{ id: "operation-uuid" }]);
      if (sql.includes("UPDATE nova_pilot_operations")) return result([], 1);
      if (sql.includes("INSERT INTO nova_pilot_outbox")) throw new Error("outbox unavailable");
      throw new Error("Unexpected SQL: " + sql);
    });
    await expect(new PostgresPilotOperationStore(pool).completeWithOutbox(
      operation().scope,
      { status: "completed", downstreamReference: "downstream-1", eventId: event.eventId },
      event,
    )).rejects.toThrow("outbox unavailable");
    expect(calls).toContain("ROLLBACK");
    expect(calls).not.toContain("COMMIT");
  });
});
