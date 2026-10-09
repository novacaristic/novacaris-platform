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

  it("denies tenant mismatch before adapter execution", async () => {
    const deps = makePilot();
    const result = await deps.pilot.execute(context, { ...request, tenantId: "tenant-synthetic-b" });
    expect(result).toEqual({ status: "denied", reason: "TENANT_CONTEXT_MISMATCH" });
    expect(deps.adapterExecute).not.toHaveBeenCalled();
  });

  it("does not execute adapter twice for the same idempotency key", async () => {
    const deps = makePilot();
    await deps.pilot.execute(context, request);
    const second = await deps.pilot.execute({ ...context, requestId: "req-002" }, {
      ...request, requestId: "req-002",
    });
    expect(second.status).toBe("duplicate");
    expect(deps.adapterExecute).toHaveBeenCalledTimes(1);
  });

  it("returns explicit failure when adapter or event recording fails", async () => {
    const adapterExecute = vi.fn(async () => { throw new Error("synthetic failure"); });
    const pilot = new FirstIntegrationPilot({
      policyAllows: async () => true,
      adapterExecute,
      recordEvent: async () => {},
    });
    const result = await pilot.execute(context, request);
    expect(result).toEqual({ status: "failed", reason: "ADAPTER_OR_EVENT_RECORDING_FAILED" });
  });
});
