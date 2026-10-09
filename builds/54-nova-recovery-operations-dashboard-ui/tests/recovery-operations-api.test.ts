import { describe, expect, it, vi } from "vitest";
import { RecoveryOperationsApi, type ApiRequest } from "../src/recovery-operations-api";
import type { RequestContext } from "../../../builds/44-shared-platform-foundation/src/contracts";

const context: RequestContext = {
  contractVersion: "1.0", requestId: "api-test", correlationId: "api-test",
  tenantId: "f8c5f9f1-8d89-4c0c-8d68-4e89a7f63e51",
  actor: { type: "user", reference: "operator-api-test" },
  authorizationDecisionReference: "authz://api-test",
};
function makeApi(resolveContext: (request: ApiRequest) => Promise<RequestContext | null> = async () => context) {
  const operators = {
    listQueue: vi.fn(async () => [{ execution_id: "execution-1" }]),
    reviewAmbiguous: vi.fn(async (_ctx: RequestContext, input: unknown) => ({ id: "review-1", input })),
  };
  const escalations = {
    list: vi.fn(async () => [{ id: "escalation-1", status: "open" }]),
    open: vi.fn(async (_ctx: RequestContext, input: unknown) => ({ id: "escalation-1", input })),
    acknowledge: vi.fn(async () => ({ id: "escalation-1", status: "acknowledged" })),
    assign: vi.fn(async () => ({ id: "escalation-1", assigned_to_actor: "reviewer" })),
    resolve: vi.fn(async () => ({ id: "escalation-1", status: "resolved" })),
  };
  return { api: new RecoveryOperationsApi(resolveContext, operators as never, escalations as never), operators, escalations };
}
describe("Build 54 recovery operations API facade", () => {
  it("requires a server-resolved authenticated context before routing", async () => {
    const { api, escalations } = makeApi(async () => null);
    const response = await api.handle({ method: "GET", path: "/api/recovery/escalations" });
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "AUTHENTICATION_REQUIRED" });
    expect(escalations.list).not.toHaveBeenCalled();
  });
  it("routes tenant-filtered escalation queue reads through the authorized service", async () => {
    const { api, escalations } = makeApi();
    const response = await api.handle({ method: "GET", path: "/api/recovery/escalations", query: { status: "open", priority: "urgent", limit: "20" } });
    expect(response.status).toBe(200);
    expect(escalations.list).toHaveBeenCalledWith(context, { status: "open", priority: "urgent", limit: 20 });
  });
  it("creates escalation through service validation, not direct database access", async () => {
    const { api, escalations } = makeApi();
    const response = await api.handle({ method: "POST", path: "/api/recovery/escalations", body: { executionId: "exec-1", priority: "urgent", reason: "review needed" } });
    expect(response.status).toBe(201);
    expect(escalations.open).toHaveBeenCalledWith(context, { executionId: "exec-1", priority: "urgent", reason: "review needed", assignedToActor: undefined, dueAt: undefined });
  });
  it("routes acknowledge, assign, resolve, and evidence review actions", async () => {
    const { api, escalations, operators } = makeApi();
    expect((await api.handle({ method: "POST", path: "/api/recovery/escalations/e-1/acknowledge" })).status).toBe(200);
    expect((await api.handle({ method: "POST", path: "/api/recovery/escalations/e-1/assign", body: { assignedToActor: "reviewer" } })).status).toBe(200);
    expect((await api.handle({ method: "POST", path: "/api/recovery/escalations/e-1/resolve", body: { evidenceReference: "evidence://ref", note: "checked" } })).status).toBe(200);
    expect((await api.handle({ method: "POST", path: "/api/recovery/executions/exec-1/review", body: { disposition: "manual_follow_up", evidenceReference: "evidence://ref", note: "escalated" } })).status).toBe(201);
    expect(escalations.acknowledge).toHaveBeenCalled();expect(escalations.assign).toHaveBeenCalled();expect(escalations.resolve).toHaveBeenCalled();expect(operators.reviewAmbiguous).toHaveBeenCalled();
  });
  it("returns not found for unknown routes and maps forbidden service responses", async () => {
    const { api, escalations } = makeApi();
    expect((await api.handle({ method: "GET", path: "/no-route" })).status).toBe(404);
    escalations.list.mockRejectedValueOnce(new Error("ESCALATION_READ_FORBIDDEN"));
    const response = await api.handle({ method: "GET", path: "/api/recovery/escalations" });
    expect(response.status).toBe(403);
  });
  it("rejects malformed request bodies with a client error", async () => {
    const { api } = makeApi();
    const response = await api.handle({ method: "POST", path: "/api/recovery/escalations", body: [] });
    expect(response.status).toBe(400);
  });
});
