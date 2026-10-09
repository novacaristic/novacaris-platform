import { validateRequestContext, type RequestContext, type PlatformEvent } from "../../44-shared-platform-foundation/src/contracts";

export interface PilotRequest {
  requestId: string;
  idempotencyKey: string;
  operation: "create_demo_task";
  tenantId: string;
  payload: { title: string; fixtureId: string };
}

export interface PilotOperation {
  scope: string;
  tenantId: string;
  operation: string;
  idempotencyKey: string;
  fingerprint: string;
  requestId: string;
  status: "in_progress" | "completed" | "denied" | "failed_retryable" | "reconciliation_required";
  result?: PilotResult;
}

export type PilotResult =
  | { status: "completed"; downstreamReference: string; eventId: string }
  | { status: "denied"; reason: string }
  | { status: "duplicate"; originalRequestId: string }
  | { status: "conflict"; reason: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST" }
  | { status: "in_progress"; originalRequestId: string }
  | { status: "failed"; reason: string }
  | { status: "reconciliation_required"; reason: "EVENT_RECORDING_FAILED_AFTER_EXECUTION"; downstreamReference: string; eventId: string };

export type ReserveResult =
  | { kind: "reserved" }
  | { kind: "existing"; operation: PilotOperation }
  | { kind: "fingerprint_conflict" };

export interface PilotOperationStore {
  /**
   * Must be atomic and backed by durable storage in production.
   * Enforce a unique key on (tenantId, operation, idempotencyKey).
   */
  reserve(operation: PilotOperation): Promise<ReserveResult>;
  markDenied(scope: string, result: Extract<PilotResult, { status: "denied" }>): Promise<void>;
  markRetryableFailure(scope: string, result: Extract<PilotResult, { status: "failed" }>): Promise<void>;
  /**
   * Persist the completed result and outbox event in one database transaction.
   */
  completeWithOutbox(scope: string, result: Extract<PilotResult, { status: "completed" }>, event: PlatformEvent): Promise<void>;
  markReconciliationRequired(scope: string, result: Extract<PilotResult, { status: "reconciliation_required" }>, event: PlatformEvent): Promise<void>;
}

export interface PilotDependencies {
  policyAllows(context: RequestContext, operation: string): Promise<boolean>;
  adapterExecute(input: PilotRequest): Promise<{ downstreamReference: string }>;
  recordEvent(event: PlatformEvent): Promise<void>;
  store: PilotOperationStore;
}

function fingerprintRequest(request: PilotRequest): string {
  // Deterministic canonical payload for this fixed-shape pilot request.
  return JSON.stringify({
    tenantId: request.tenantId,
    operation: request.operation,
    title: request.payload.title,
    fixtureId: request.payload.fixtureId,
  });
}

function scopeFor(context: RequestContext, request: PilotRequest): string {
  return `${context.tenantId}:${request.operation}:${request.idempotencyKey}`;
}

export class FirstIntegrationPilot {
  constructor(private readonly deps: PilotDependencies) {}

  async execute(context: RequestContext, request: PilotRequest): Promise<PilotResult> {
    const contextValidation = validateRequestContext(context);
    if (!contextValidation.valid) {
      return { status: "failed", reason: contextValidation.blockers.join(",") };
    }
    if (context.tenantId !== request.tenantId) {
      return { status: "denied", reason: "TENANT_CONTEXT_MISMATCH" };
    }
    if (!request.requestId || !request.idempotencyKey || !request.payload?.fixtureId || !request.payload?.title) {
      return { status: "failed", reason: "REQUIRED_REQUEST_FIELDS_MISSING" };
    }

    const scope = scopeFor(context, request);
    const reservation: PilotOperation = {
      scope,
      tenantId: context.tenantId,
      operation: request.operation,
      idempotencyKey: request.idempotencyKey,
      fingerprint: fingerprintRequest(request),
      requestId: request.requestId,
      status: "in_progress",
    };

    const reserved = await this.deps.store.reserve(reservation);
    if (reserved.kind === "fingerprint_conflict") {
      return { status: "conflict", reason: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST" };
    }
    if (reserved.kind === "existing") {
      const prior = reserved.operation;
      if (prior.fingerprint !== reservation.fingerprint) {
        return { status: "conflict", reason: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST" };
      }
      if (prior.status === "completed" && prior.result?.status === "completed") {
        return { status: "duplicate", originalRequestId: prior.requestId };
      }
      if (prior.status === "denied" && prior.result?.status === "denied") return prior.result;
      if (prior.status === "reconciliation_required" && prior.result?.status === "reconciliation_required") return prior.result;
      if (prior.status === "in_progress") return { status: "in_progress", originalRequestId: prior.requestId };
      // Only a failure known to have happened before a downstream success may retry.
      if (prior.status !== "failed_retryable") return { status: "in_progress", originalRequestId: prior.requestId };
      // Store adapters must atomically transition failed_retryable back to in_progress.
      const retryReservation = await this.deps.store.reserve({ ...reservation, requestId: request.requestId });
      if (retryReservation.kind !== "reserved") {
        return { status: "in_progress", originalRequestId: prior.requestId };
      }
    }

    const allowed = await this.deps.policyAllows(context, request.operation);
    if (!allowed) {
      const result: Extract<PilotResult, { status: "denied" }> = { status: "denied", reason: "POLICY_DENIED" };
      await this.deps.store.markDenied(scope, result);
      return result;
    }

    let downstream: { downstreamReference: string };
    try {
      downstream = await this.deps.adapterExecute(request);
    } catch {
      const result: Extract<PilotResult, { status: "failed" }> = { status: "failed", reason: "ADAPTER_EXECUTION_FAILED" };
      await this.deps.store.markRetryableFailure(scope, result);
      return result;
    }

    const eventId = `pilot-event:${request.requestId}`;
    const event: PlatformEvent = {
      eventId,
      eventType: "pilot.operation.completed",
      eventVersion: "1.0",
      occurredAt: new Date().toISOString(),
      tenantId: context.tenantId,
      actorReference: context.actor.reference,
      correlationId: context.correlationId,
      idempotencyKey: request.idempotencyKey,
      payload: {
        requestId: request.requestId,
        operation: request.operation,
        downstreamReference: downstream.downstreamReference,
        fixtureId: request.payload.fixtureId,
      },
    };
    const result: Extract<PilotResult, { status: "completed" }> = {
      status: "completed",
      downstreamReference: downstream.downstreamReference,
      eventId,
    };

    try {
      // Durable store must atomically persist result + outbox event.
      await this.deps.store.completeWithOutbox(scope, result, event);
    } catch {
      const reconciliation: Extract<PilotResult, { status: "reconciliation_required" }> = {
        status: "reconciliation_required",
        reason: "EVENT_RECORDING_FAILED_AFTER_EXECUTION",
        downstreamReference: downstream.downstreamReference,
        eventId,
      };
      // If the store is unavailable, this may also fail; caller must treat the
      // outcome as uncertain and reconcile by idempotency key before retrying.
      await this.deps.store.markReconciliationRequired(scope, reconciliation, event);
      return reconciliation;
    }

    // Delivery can be retried from the durable outbox. Do not lose the
    // completed outcome merely because a downstream event sink is unavailable.
    try {
      await this.deps.recordEvent(event);
    } catch {
      // Outbox remains the durable source for a separate dispatcher.
    }
    return result;
  }
}
