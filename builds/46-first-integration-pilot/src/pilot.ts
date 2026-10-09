import { validateRequestContext, type RequestContext, type PlatformEvent } from "../../44-shared-platform-foundation/src/contracts";

export interface PilotRequest {
  requestId: string;
  idempotencyKey: string;
  operation: "create_demo_task";
  tenantId: string;
  payload: { title: string; fixtureId: string };
}

export interface PilotDependencies {
  policyAllows(context: RequestContext, operation: string): Promise<boolean>;
  adapterExecute(input: PilotRequest): Promise<{ downstreamReference: string }>;
  recordEvent(event: PlatformEvent): Promise<void>;
}

export type PilotResult =
  | { status: "completed"; downstreamReference: string; eventId: string }
  | { status: "denied"; reason: string }
  | { status: "duplicate"; originalRequestId: string }
  | { status: "failed"; reason: string };

export class FirstIntegrationPilot {
  private readonly idempotency = new Map<string, { requestId: string; result: PilotResult }>();

  constructor(private readonly deps: PilotDependencies) {}

  async execute(context: RequestContext, request: PilotRequest): Promise<PilotResult> {
    const contextValidation = validateRequestContext(context);
    if (!contextValidation.valid) {
      return { status: "failed", reason: contextValidation.blockers.join(",") };
    }
    if (context.tenantId !== request.tenantId) {
      return { status: "denied", reason: "TENANT_CONTEXT_MISMATCH" };
    }
    if (!request.requestId || !request.idempotencyKey || !request.payload.fixtureId) {
      return { status: "failed", reason: "REQUIRED_REQUEST_FIELDS_MISSING" };
    }

    const idempotencyScope = `${context.tenantId}:${request.operation}:${request.idempotencyKey}`;
    const prior = this.idempotency.get(idempotencyScope);
    if (prior) {
      return { status: "duplicate", originalRequestId: prior.requestId };
    }

    const allowed = await this.deps.policyAllows(context, request.operation);
    if (!allowed) {
      const result: PilotResult = { status: "denied", reason: "POLICY_DENIED" };
      this.idempotency.set(idempotencyScope, { requestId: request.requestId, result });
      return result;
    }

    try {
      const downstream = await this.deps.adapterExecute(request);
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
      await this.deps.recordEvent(event);
      const result: PilotResult = {
        status: "completed",
        downstreamReference: downstream.downstreamReference,
        eventId,
      };
      this.idempotency.set(idempotencyScope, { requestId: request.requestId, result });
      return result;
    } catch {
      return { status: "failed", reason: "ADAPTER_OR_EVENT_RECORDING_FAILED" };
    }
  }
}
