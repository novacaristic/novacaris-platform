import type { PlatformEvent } from "../../44-shared-platform-foundation/src/contracts";
import type {
  PilotOperation,
  PilotOperationStore,
  PilotResult,
  ReserveResult,
} from "./pilot";

/** Minimal pg-compatible interfaces; callers supply a configured pool. */
export interface SqlResult<Row> {
  rows: Row[];
  rowCount: number | null;
}

export interface SqlClient {
  query<Row = Record<string, unknown>>(text: string, values?: unknown[]): Promise<SqlResult<Row>>;
  release(): void;
}

export interface SqlPool {
  connect(): Promise<SqlClient>;
}

interface OperationRow {
  id: string;
  tenant_id: string;
  operation_name: string;
  idempotency_key: string;
  request_fingerprint: string;
  original_request_id: string;
  status: PilotOperation["status"];
  result: PilotResult | null;
}

function identityFromScope(scope: string): { tenantId: string; operation: string; idempotencyKey: string } {
  const first = scope.indexOf(":");
  const second = scope.indexOf(":", first + 1);
  if (first <= 0 || second <= first + 1 || second === scope.length - 1) {
    throw new Error("INVALID_PILOT_OPERATION_SCOPE");
  }
  return {
    tenantId: scope.slice(0, first),
    operation: scope.slice(first + 1, second),
    idempotencyKey: scope.slice(second + 1),
  };
}

function asOperation(row: OperationRow, scope: string): PilotOperation {
  return {
    scope,
    tenantId: row.tenant_id,
    operation: row.operation_name,
    idempotencyKey: row.idempotency_key,
    fingerprint: row.request_fingerprint,
    requestId: row.original_request_id,
    status: row.status,
    ...(row.result ? { result: row.result } : {}),
  };
}

/**
 * PostgreSQL-backed operation store.
 *
 * This class expects the Build 46 migration to have been applied and a trusted
 * PostgreSQL pool to be injected by the host. It does not create connections,
 * read secrets, or apply migrations itself.
 */
export class PostgresPilotOperationStore implements PilotOperationStore {
  constructor(private readonly pool: SqlPool) {}

  async reserve(operation: PilotOperation): Promise<ReserveResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<OperationRow>(
        `INSERT INTO nova_pilot_operations
          (tenant_id, operation_name, idempotency_key, request_fingerprint, original_request_id, status)
         VALUES ($1::uuid, $2, $3, $4, $5, 'in_progress')
         ON CONFLICT (tenant_id, operation_name, idempotency_key) DO NOTHING
         RETURNING id, tenant_id, operation_name, idempotency_key, request_fingerprint, original_request_id, status, result`,
        [operation.tenantId, operation.operation, operation.idempotencyKey, operation.fingerprint, operation.requestId],
      );
      if (inserted.rows.length > 0) {
        await client.query("COMMIT");
        return { kind: "reserved" };
      }

      const selected = await client.query<OperationRow>(
        `SELECT id, tenant_id, operation_name, idempotency_key, request_fingerprint, original_request_id, status, result
           FROM nova_pilot_operations
          WHERE tenant_id = $1::uuid AND operation_name = $2 AND idempotency_key = $3
          FOR UPDATE`,
        [operation.tenantId, operation.operation, operation.idempotencyKey],
      );
      const prior = selected.rows[0];
      if (!prior) throw new Error("IDEMPOTENCY_RESERVATION_DISAPPEARED");
      if (prior.request_fingerprint !== operation.fingerprint) {
        await client.query("COMMIT");
        return { kind: "fingerprint_conflict" };
      }
      if (prior.status === "failed_retryable") {
        await client.query(
          `UPDATE nova_pilot_operations
              SET status = 'in_progress', original_request_id = $2, result = NULL,
                  last_error_code = NULL, updated_at = now()
            WHERE id = $1`,
          [prior.id, operation.requestId],
        );
        await client.query("COMMIT");
        return { kind: "reserved" };
      }
      await client.query("COMMIT");
      return { kind: "existing", operation: asOperation(prior, operation.scope) };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* retain original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async markDenied(scope: string, result: Extract<PilotResult, { status: "denied" }>): Promise<void> {
    await this.updateByScope(scope, "denied", result, result.reason);
  }

  async markRetryableFailure(scope: string, result: Extract<PilotResult, { status: "failed" }>): Promise<void> {
    await this.updateByScope(scope, "failed_retryable", result, result.reason);
  }

  async completeWithOutbox(
    scope: string,
    result: Extract<PilotResult, { status: "completed" }>,
    event: PlatformEvent,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const identity = identityFromScope(scope);
      const found = await client.query<{ id: string }>(
        `SELECT id FROM nova_pilot_operations
          WHERE tenant_id = $1::uuid AND operation_name = $2 AND idempotency_key = $3
          FOR UPDATE`,
        [identity.tenantId, identity.operation, identity.idempotencyKey],
      );
      const operation = found.rows[0];
      if (!operation) throw new Error("PILOT_OPERATION_NOT_FOUND");
      await client.query(
        `UPDATE nova_pilot_operations
            SET status = 'completed', result = $2::jsonb,
                downstream_reference = $3, event_id = $4,
                last_error_code = NULL, updated_at = now(), completed_at = now()
          WHERE id = $1`,
        [operation.id, JSON.stringify(result), result.downstreamReference, result.eventId],
      );
      await client.query(
        `INSERT INTO nova_pilot_outbox
          (tenant_id, operation_id, event_id, event_type, event_version, correlation_id, payload)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (tenant_id, event_id) DO NOTHING`,
        [event.tenantId, operation.id, event.eventId, event.eventType, event.eventVersion, event.correlationId, JSON.stringify(event)],
      );
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* retain original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async markReconciliationRequired(
    scope: string,
    result: Extract<PilotResult, { status: "reconciliation_required" }>,
    event: PlatformEvent,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const identity = identityFromScope(scope);
      const found = await client.query<{ id: string }>(
        `SELECT id FROM nova_pilot_operations
          WHERE tenant_id = $1::uuid AND operation_name = $2 AND idempotency_key = $3
          FOR UPDATE`,
        [identity.tenantId, identity.operation, identity.idempotencyKey],
      );
      const operation = found.rows[0];
      if (!operation) throw new Error("PILOT_OPERATION_NOT_FOUND");
      await client.query(
        `UPDATE nova_pilot_operations
            SET status = 'reconciliation_required', result = $2::jsonb,
                downstream_reference = $3, event_id = $4,
                last_error_code = $5, updated_at = now()
          WHERE id = $1`,
        [operation.id, JSON.stringify(result), result.downstreamReference, result.eventId, result.reason],
      );
      // Keep the evidence event pending for a dispatcher, even though the
      // operation requires reconciliation. A duplicate insert is harmless.
      await client.query(
        `INSERT INTO nova_pilot_outbox
          (tenant_id, operation_id, event_id, event_type, event_version, correlation_id, payload)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (tenant_id, event_id) DO NOTHING`,
        [event.tenantId, operation.id, event.eventId, event.eventType, event.eventVersion, event.correlationId, JSON.stringify(event)],
      );
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* retain original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  private async updateByScope(
    scope: string,
    status: "denied" | "failed_retryable",
    result: Extract<PilotResult, { status: "denied" | "failed" }>,
    errorCode: string,
  ): Promise<void> {
    const identity = identityFromScope(scope);
    const client = await this.pool.connect();
    try {
      const updated = await client.query(
        `UPDATE nova_pilot_operations
            SET status = $4, result = $5::jsonb, last_error_code = $6, updated_at = now()
          WHERE tenant_id = $1::uuid AND operation_name = $2 AND idempotency_key = $3`,
        [identity.tenantId, identity.operation, identity.idempotencyKey, status, JSON.stringify(result), errorCode],
      );
      if (updated.rowCount === 0) throw new Error("PILOT_OPERATION_NOT_FOUND");
    } finally {
      client.release();
    }
  }
}
