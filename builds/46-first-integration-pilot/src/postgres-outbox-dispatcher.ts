import type { PlatformEvent } from "../../44-shared-platform-foundation/src/contracts";
import type { SqlClient, SqlPool } from "./postgres-operation-store";

export interface OutboxRecord {
  id: string;
  tenant_id: string;
  operation_id: string;
  event_id: string;
  event_type: string;
  event_version: string;
  correlation_id: string;
  payload: PlatformEvent;
  status: "pending" | "delivering" | "delivered" | "dead_letter";
  attempt_count: number;
  lease_owner: string | null;
}

export interface OutboxStore {
  claimBatch(workerId: string, limit: number, leaseSeconds: number): Promise<OutboxRecord[]>;
  markDelivered(id: string, workerId: string): Promise<void>;
  markDeliveryFailure(id: string, workerId: string, error: string, maxAttempts: number): Promise<"retry_scheduled" | "dead_letter">;
}

export class PostgresOutboxStore implements OutboxStore {
  constructor(private readonly pool: SqlPool) {}

  async claimBatch(workerId: string, limit: number, leaseSeconds: number): Promise<OutboxRecord[]> {
    if (!workerId.trim()) throw new Error("OUTBOX_WORKER_ID_REQUIRED");
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("OUTBOX_BATCH_LIMIT_INVALID");
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 3600) throw new Error("OUTBOX_LEASE_DURATION_INVALID");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const claimed = await client.query<OutboxRecord>(
        `WITH candidates AS (
           SELECT id
             FROM nova_pilot_outbox
            WHERE (status = 'pending' AND next_attempt_at <= now())
               OR (status = 'delivering' AND (lease_until IS NULL OR lease_until <= now()))
            ORDER BY next_attempt_at, created_at
            FOR UPDATE SKIP LOCKED
            LIMIT $1
         )
         UPDATE nova_pilot_outbox AS outbox
            SET status = 'delivering',
                lease_owner = $2,
                lease_until = now() + ($3::int * interval '1 second'),
                attempt_count = outbox.attempt_count + 1
           FROM candidates
          WHERE outbox.id = candidates.id
         RETURNING outbox.id, outbox.tenant_id, outbox.operation_id, outbox.event_id,
                   outbox.event_type, outbox.event_version, outbox.correlation_id,
                   outbox.payload, outbox.status, outbox.attempt_count, outbox.lease_owner`,
        [limit, workerId, leaseSeconds],
      );
      await client.query("COMMIT");
      return claimed.rows;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* keep original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async markDelivered(id: string, workerId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `UPDATE nova_pilot_outbox
            SET status = 'delivered', delivered_at = now(), last_error = NULL,
                lease_owner = NULL, lease_until = NULL
          WHERE id = $1::uuid AND status = 'delivering' AND lease_owner = $2`,
        [id, workerId],
      );
      if (result.rowCount !== 1) throw new Error("OUTBOX_LEASE_LOST");
    } finally {
      client.release();
    }
  }

  async markDeliveryFailure(
    id: string,
    workerId: string,
    error: string,
    maxAttempts: number,
  ): Promise<"retry_scheduled" | "dead_letter"> {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error("OUTBOX_MAX_ATTEMPTS_INVALID");
    const client = await this.pool.connect();
    try {
      const updated = await client.query<{ status: "retry_scheduled" | "dead_letter" }>(
        `UPDATE nova_pilot_outbox
            SET status = CASE WHEN attempt_count >= $4 THEN 'dead_letter' ELSE 'pending' END,
                next_attempt_at = CASE
                  WHEN attempt_count >= $4 THEN next_attempt_at
                  ELSE now() + (LEAST(3600, power(2, LEAST(attempt_count, 11)))::int * interval '1 second')
                END,
                last_error = left($3, 2000),
                lease_owner = NULL, lease_until = NULL
          WHERE id = $1::uuid AND status = 'delivering' AND lease_owner = $2
          RETURNING CASE WHEN status = 'dead_letter' THEN 'dead_letter' ELSE 'retry_scheduled' END AS status`,
        [id, workerId, error || "DELIVERY_FAILED", maxAttempts],
      );
      if (updated.rowCount !== 1 || !updated.rows[0]) throw new Error("OUTBOX_LEASE_LOST");
      return updated.rows[0].status;
    } finally {
      client.release();
    }
  }
}

export interface DispatchSummary {
  claimed: number;
  delivered: number;
  retryScheduled: number;
  deadLettered: number;
}

export async function dispatchOutboxBatch(input: {
  store: OutboxStore;
  workerId: string;
  limit?: number;
  leaseSeconds?: number;
  maxAttempts?: number;
  deliver: (event: PlatformEvent) => Promise<void>;
}): Promise<DispatchSummary> {
  const records = await input.store.claimBatch(input.workerId, input.limit ?? 25, input.leaseSeconds ?? 60);
  const summary: DispatchSummary = { claimed: records.length, delivered: 0, retryScheduled: 0, deadLettered: 0 };
  for (const record of records) {
    try {
      await input.deliver(record.payload);
      await input.store.markDelivered(record.id, input.workerId);
      summary.delivered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN_DELIVERY_ERROR";
      const result = await input.store.markDeliveryFailure(record.id, input.workerId, message, input.maxAttempts ?? 8);
      if (result === "dead_letter") summary.deadLettered += 1;
      else summary.retryScheduled += 1;
    }
  }
  return summary;
}
