import { describe, expect, it, vi } from "vitest";
import { FirstIntegrationPilot, type PilotRequest } from "../src/pilot";
import type { RequestContext, PlatformEvent } from "../../44-shared-platform-foundation/src/contracts";

const context: RequestContext = {
  contractVersion: "1.0",
  requestId: "req-001",
  correlationId: "corr-001",
  tenantId: "tenant-synthetic-a",
  actor: { type: "user", reference: "user-synthetic-1" },
};

const request: PilotRequest = {
  requestId: "req-001",
  idempotencyKey: "idem-001",
  operation: "create_demo_task",
  tenantId: "tenant-synthetic-a",
  payload: { title: "Synthetic demo task", fixtureId: "fixture-001" },
};

function makePilot(allowed = true) {
  const policyAllows = vi.fn(async () => allowed);
  const adapterExecute = vi.fn(async () => ({ downstreamReference: "simulated-task-001" }));
  const recordEvent = vi.fn(async (_event: PlatformEvent) => {});
  return {
    pilot: new FirstIntegrationPilot({ policyAllows, adapterExecute, recordEvent }),
    policyAllows,
    adapterExecute,
    recordEvent,
  };
}

describe("Build 46 first integration pilot", () => {
  it("completes an allowed synthetic request and records a correlated event", async () => {
    const deps = makePilot();
    const result = await deps.pilot.execute(context, request);
    expect(result.status).toBe("completed");
    expect(deps.adapterExecute).toHaveBeenCalledTimes(1);
    expect(deps.recordEvent).toHaveBeenCalledTimes(1);
    expect(deps.recordEvent.mock.calls[0][0].correlationId).toBe("corr-001");
  });

  it("does not call adapter when policy denies", async () => {
    const deps = makePilot(false);
    const result = await deps.pilot.execute(context, request);
    expect(result).toEqual({ status: "denied", reason: "POLICY_DENIED" });
    expect(deps.adapterExecute).not.toHaveBeenCalled();
  });

  it("denies tenant mismatch before policy or adapter execution", async () => {
    const deps = makePilot();
    const result = await deps.pilot.execute(context, { ...request, tenantId: "tenant-synthetic-b" });
    expect(result).toEqual({ status: "denied", reason: "TENANT_CONTEXT_MISMATCH" });
    expect(deps.policyAllows).not.toHaveBeenCalled();
    expect(deps.adapterExecute).not.toHaveBeenCalled();
  });

  it("rejects invalid actor context before policy or adapter execution", async () => {
    const deps = makePilot();
    const invalidContext = { ...context, actor: { type: "user", reference: "" } } as RequestContext;
    const result = await deps.pilot.execute(invalidContext, request);
    expect(result.status).toBe("failed");
    expect(deps.policyAllows).not.toHaveBeenCalled();
    expect(deps.adapterExecute).not.toHaveBeenCalled();
  });

  it("does not execute adapter twice for the same idempotency key", async () => {
    const deps = makePilot();
    await deps.pilot.execute(context, request);
    const second = await deps.pilot.execute({ ...context, requestId: "req-002" }, {
      ...request, requestId: "req-002",
    });
    expect(second).toEqual({ status: "duplicate", originalRequestId: "req-001" });
    expect(deps.adapterExecute).toHaveBeenCalledTimes(1);
  });

  it("allows retry after adapter execution fails before a downstream side effect is confirmed", async () => {
    const adapterExecute = vi.fn()
      .mockRejectedValueOnce(new Error("synthetic failure"))
      .mockResolvedValueOnce({ downstreamReference: "simulated-task-002" });
    const recordEvent = vi.fn(async (_event: PlatformEvent) => {});
    const pilot = new FirstIntegrationPilot({ policyAllows: async () => true, adapterExecute, recordEvent });

    const first = await pilot.execute(context, request);
    const second = await pilot.execute(context, request);

    expect(first).toEqual({ status: "failed", reason: "ADAPTER_EXECUTION_FAILED" });
    expect(second.status).toBe("completed");
    expect(adapterExecute).toHaveBeenCalledTimes(2);
  });

  it("requires reconciliation and blocks blind retry when event recording fails after execution", async () => {
    const adapterExecute = vi.fn(async () => ({ downstreamReference: "simulated-task-003" }));
    const recordEvent = vi.fn(async (_event: PlatformEvent) => { throw new Error("ledger unavailable"); });
    const pilot = new FirstIntegrationPilot({ policyAllows: async () => true, adapterExecute, recordEvent });

    const first = await pilot.execute(context, request);
    const retry = await pilot.execute({ ...context, requestId: "req-002" }, { ...request, requestId: "req-002" });

    expect(first).toEqual({
      status: "reconciliation_required",
      reason: "EVENT_RECORDING_FAILED_AFTER_EXECUTION",
      downstreamReference: "simulated-task-003",
      eventId: "pilot-event:req-001",
    });
    expect(retry).toEqual({ status: "duplicate", originalRequestId: "req-001" });
    expect(adapterExecute).toHaveBeenCalledTimes(1);
  });
});
