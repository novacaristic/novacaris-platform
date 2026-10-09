import { describe, expect, it, vi } from "vitest";
import { FirstIntegrationPilot, type PilotOperation, type PilotOperationStore, type PilotRequest, type PilotResult, type ReserveResult } from "../src/pilot";
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

/** Shared map models a durable database across store/pilot object recreation. */
class TestDurableStore implements PilotOperationStore {
  readonly operations = new Map<string, PilotOperation>();
  readonly outbox = new Map<string, PlatformEvent>();

  async reserve(operation: PilotOperation): Promise<ReserveResult> {
    const prior = this.operations.get(operation.scope);
    if (prior) {
      if (prior.fingerprint !== operation.fingerprint) return { kind: "fingerprint_conflict" };
      if (prior.status === "failed_retryable") {
        this.operations.set(operation.scope, { ...operation, status: "in_progress" });
        return { kind: "reserved" };
      }
      return { kind: "existing", operation: prior };
    }
    this.operations.set(operation.scope, operation);
    return { kind: "reserved" };
  }

  async markDenied(scope: string, result: Extract<PilotResult, { status: "denied" }>) {
    const prior = this.operations.get(scope)!;
    this.operations.set(scope, { ...prior, status: "denied", result });
  }
  async markRetryableFailure(scope: string, result: Extract<PilotResult, { status: "failed" }>) {
    const prior = this.operations.get(scope)!;
    this.operations.set(scope, { ...prior, status: "failed_retryable", result });
  }
  async completeWithOutbox(scope: string, result: Extract<PilotResult, { status: "completed" }>, event: PlatformEvent) {
    const prior = this.operations.get(scope)!;
    this.operations.set(scope, { ...prior, status: "completed", result });
    this.outbox.set(event.eventId, event);
  }
  async markReconciliationRequired(scope: string, result: Extract<PilotResult, { status: "reconciliation_required" }>, event: PlatformEvent) {
    const prior = this.operations.get(scope)!;
    this.operations.set(scope, { ...prior, status: "reconciliation_required", result });
    this.outbox.set(event.eventId, event);
  }
}

function makePilot(store = new TestDurableStore(), allowed = true, adapterExecute = vi.fn(async () => ({ downstreamReference: "simulated-task-001" })), recordEvent = vi.fn(async (_event: PlatformEvent) => {})) {
  const policyAllows = vi.fn(async () => allowed);
  return {
    store,
    policyAllows,
    adapterExecute,
    recordEvent,
    pilot: new FirstIntegrationPilot({ policyAllows, adapterExecute, recordEvent, store }),
  };
}

describe("Build 46 durable execution pilot", () => {
  it("completes an allowed synthetic request and persists result plus outbox event", async () => {
    const deps = makePilot();
    const result = await deps.pilot.execute(context, request);
    expect(result.status).toBe("completed");
    expect(deps.adapterExecute).toHaveBeenCalledTimes(1);
    expect(deps.store.outbox.size).toBe(1);
    expect(deps.store.operations.get("tenant-synthetic-a:create_demo_task:idem-001")?.status).toBe("completed");
  });

  it("does not call adapter when policy denies", async () => {
    const deps = makePilot(new TestDurableStore(), false);
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

  it("returns duplicate after pilot recreation using the same durable store", async () => {
    const store = new TestDurableStore();
    const first = makePilot(store);
    await first.pilot.execute(context, request);

    const recreated = makePilot(store);
    const retry = await recreated.pilot.execute({ ...context, requestId: "req-002" }, { ...request, requestId: "req-002" });

    expect(retry).toEqual({ status: "duplicate", originalRequestId: "req-001" });
    expect(recreated.adapterExecute).not.toHaveBeenCalled();
  });

  it("rejects reuse of an idempotency key with a different payload", async () => {
    const deps = makePilot();
    await deps.pilot.execute(context, request);
    const conflict = await deps.pilot.execute(context, { ...request, payload: { ...request.payload, title: "Changed payload" } });
    expect(conflict).toEqual({ status: "conflict", reason: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST" });
    expect(deps.adapterExecute).toHaveBeenCalledTimes(1);
  });

  it("retries after a known adapter failure", async () => {
    const store = new TestDurableStore();
    const adapter = vi.fn().mockRejectedValueOnce(new Error("before side effect")).mockResolvedValueOnce({ downstreamReference: "simulated-task-002" });
    const first = makePilot(store, true, adapter);
    expect(await first.pilot.execute(context, request)).toEqual({ status: "failed", reason: "ADAPTER_EXECUTION_FAILED" });
    const second = makePilot(store, true, adapter);
    expect((await second.pilot.execute(context, request)).status).toBe("completed");
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  it("retains reconciliation state and prevents blind retry after outbox persistence fails", async () => {
    const store = new TestDurableStore();
    const adapter = vi.fn(async () => ({ downstreamReference: "simulated-task-003" }));
    store.completeWithOutbox = async () => { throw new Error("database transaction unavailable"); };
    const first = makePilot(store, true, adapter);
    const result = await first.pilot.execute(context, request);
    expect(result.status).toBe("reconciliation_required");
    expect(adapter).toHaveBeenCalledTimes(1);
    const retry = await makePilot(store, true, adapter).pilot.execute({ ...context, requestId: "req-002" }, { ...request, requestId: "req-002" });
    expect(retry.status).toBe("reconciliation_required");
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it("does not fail a completed operation when the event sink is temporarily unavailable", async () => {
    const deps = makePilot(new TestDurableStore(), true, vi.fn(async () => ({ downstreamReference: "simulated-task-004" })), vi.fn(async () => { throw new Error("event sink down"); }));
    const result = await deps.pilot.execute(context, request);
    expect(result.status).toBe("completed");
    expect(deps.store.outbox.size).toBe(1);
  });
});
