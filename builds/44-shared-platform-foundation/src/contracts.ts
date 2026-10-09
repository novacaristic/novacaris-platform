export type ContractVersion = "1.0";

export interface RequestContext {
  contractVersion: ContractVersion;
  requestId: string;
  correlationId: string;
  tenantId: string;
  actor: {
    type: "user" | "agent" | "service";
    reference: string;
  };
  sessionReference?: string;
  authorizationDecisionReference?: string;
}

export interface ApiSuccess<T> {
  ok: true;
  requestId: string;
  correlationId: string;
  data: T;
}

export interface ApiFailure {
  ok: false;
  requestId: string;
  correlationId: string;
  error: {
    code: string;
    message: string;
    retryable: boolean;
    detailsReference?: string;
  };
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export interface PlatformEvent<T = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  eventVersion: string;
  occurredAt: string;
  tenantId: string;
  actorReference: string;
  correlationId: string;
  causationId?: string;
  idempotencyKey?: string;
  payload: T;
}

export interface HealthStatus {
  service: string;
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  checkedAt: string;
  revision?: string;
  dependencies: Array<{
    name: string;
    status: "healthy" | "degraded" | "unhealthy" | "unknown";
    evidenceReference?: string;
  }>;
}

export function validateRequestContext(
  context: RequestContext,
): { valid: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!context.contractVersion) blockers.push("CONTRACT_VERSION_REQUIRED");
  if (!context.requestId) blockers.push("REQUEST_ID_REQUIRED");
  if (!context.correlationId) blockers.push("CORRELATION_ID_REQUIRED");
  if (!context.tenantId) blockers.push("TENANT_ID_REQUIRED");
  if (!context.actor?.type || !context.actor?.reference) blockers.push("ACTOR_CONTEXT_REQUIRED");
  return { valid: blockers.length === 0, blockers };
}

export function createSuccess<T>(
  context: Pick<RequestContext, "requestId" | "correlationId">,
  data: T,
): ApiSuccess<T> {
  return { ok: true, requestId: context.requestId, correlationId: context.correlationId, data };
}

export function createFailure(
  context: Pick<RequestContext, "requestId" | "correlationId">,
  code: string,
  message: string,
  retryable = false,
): ApiFailure {
  return {
    ok: false,
    requestId: context.requestId,
    correlationId: context.correlationId,
    error: { code, message, retryable },
  };
}
