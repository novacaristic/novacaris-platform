import type { RequestContext } from "../../../builds/44-shared-platform-foundation/src/contracts";
import { RecoveryOperatorConsole, type OperatorQueueStatus } from "../../../builds/52-nova-recovery-operator-console/src/recovery-operator-console";
import { RecoveryEscalations, type EscalationPriority, type EscalationStatus } from "../../../builds/53-nova-recovery-operations-dashboard/src/recovery-escalations";

export interface ApiRequest {
  method: string;
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
}
export interface ApiResponse<T = unknown> { status: number; body: T }
export type AuthenticatedContextResolver = (request: ApiRequest) => Promise<RequestContext | null>;

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("REQUEST_BODY_INVALID");
  return value as Record<string, unknown>;
}
function stringField(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) throw new Error(`FIELD_REQUIRED:${field}`);
  return value.trim();
}
function json(status: number, body: unknown): ApiResponse { return { status, body }; }
function mapError(error: unknown): ApiResponse {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  const forbidden = /FORBIDDEN/.test(code);
  const missing = /NOT_FOUND/.test(code);
  const conflict = /ALREADY_|NOT_OPEN|NOT_AMBIGUOUS|NOT_EXECUTABLE/.test(code);
  const badRequest = /REQUIRED|INVALID|HUMAN_ACTOR/.test(code);
  return json(forbidden ? 403 : missing ? 404 : conflict ? 409 : badRequest ? 400 : 500, {
    error: code,
    message: code === "INTERNAL_ERROR" ? "Request could not be completed." : code,
  });
}

/**
 * Framework-neutral route facade. The host HTTP framework must call resolveContext
 * from a verified server-side session; never construct tenant/actor context from request JSON.
 */
export class RecoveryOperationsApi {
  constructor(
    private readonly resolveContext: AuthenticatedContextResolver,
    private readonly operators: RecoveryOperatorConsole,
    private readonly escalations: RecoveryEscalations,
  ) {}

  async handle(request: ApiRequest): Promise<ApiResponse> {
    try {
      const context = await this.resolveContext(request);
      if (!context) return json(401, { error: "AUTHENTICATION_REQUIRED" });
      const method = request.method.toUpperCase();
      const path = request.path.replace(/\/+$/, "") || "/";
      const query = request.query ?? {};

      if (method === "GET" && path === "/api/recovery/queue") {
        const status = query.status as OperatorQueueStatus | undefined;
        const rows = await this.operators.listQueue(context, { status, limit: query.limit ? Number(query.limit) : 50 });
        return json(200, { items: rows, count: rows.length });
      }
      if (method === "GET" && path === "/api/recovery/escalations") {
        const status = query.status as EscalationStatus | undefined;
        const priority = query.priority as EscalationPriority | undefined;
        const rows = await this.escalations.list(context, { status, priority, limit: query.limit ? Number(query.limit) : 50 });
        return json(200, { items: rows, count: rows.length });
      }
      if (method === "POST" && path === "/api/recovery/escalations") {
        const body = objectBody(request.body);
        const row = await this.escalations.open(context, {
          executionId: stringField(body, "executionId"),
          priority: body.priority as EscalationPriority,
          reason: stringField(body, "reason"),
          assignedToActor: typeof body.assignedToActor === "string" ? body.assignedToActor : undefined,
          dueAt: typeof body.dueAt === "string" && body.dueAt ? body.dueAt : undefined,
        });
        return json(201, { item: row });
      }
      const match = path.match(/^\/api\/recovery\/escalations\/([^/]+)\/(acknowledge|assign|resolve)$/);
      if (method === "POST" && match) {
        const escalationId = decodeURIComponent(match[1]);
        const action = match[2];
        if (action === "acknowledge") return json(200, { item: await this.escalations.acknowledge(context, escalationId) });
        const body = objectBody(request.body);
        if (action === "assign") return json(200, { item: await this.escalations.assign(context, escalationId, stringField(body, "assignedToActor")) });
        return json(200, { item: await this.escalations.resolve(context, {
          escalationId,
          evidenceReference: stringField(body, "evidenceReference"),
          note: stringField(body, "note"),
        }) });
      }
      const review = path.match(/^\/api\/recovery\/executions\/([^/]+)\/review$/);
      if (method === "POST" && review) {
        const body = objectBody(request.body);
        return json(201, { item: await this.operators.reviewAmbiguous(context, {
          executionId: decodeURIComponent(review[1]),
          disposition: body.disposition as "downstream_completed" | "downstream_not_executed" | "manual_follow_up",
          evidenceReference: stringField(body, "evidenceReference"),
          note: stringField(body, "note"),
        }) });
      }
      return json(404, { error: "ROUTE_NOT_FOUND" });
    } catch (error) { return mapError(error); }
  }
}
