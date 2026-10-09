import { describe, expect, it } from "vitest";
import { createFailure, createSuccess, validateRequestContext } from "../src/contracts";

const context = {
  contractVersion: "1.0" as const,
  requestId: "req-1",
  correlationId: "corr-1",
  tenantId: "tenant-1",
  actor: { type: "user" as const, reference: "user-1" },
};

describe("Build 44 shared contracts", () => {
  it("requires tenant and actor context", () => {
    const result = validateRequestContext({ ...context, tenantId: "" });
    expect(result.valid).toBe(false);
    expect(result.blockers).toContain("TENANT_ID_REQUIRED");
  });

  it("creates success envelope with correlation identifiers", () => {
    const result = createSuccess(context, { accepted: true });
    expect(result.ok).toBe(true);
    expect(result.requestId).toBe("req-1");
    expect(result.correlationId).toBe("corr-1");
  });

  it("creates stable failure envelope", () => {
    const result = createFailure(context, "POLICY_DENIED", "Request denied");
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("POLICY_DENIED");
    expect(result.error.retryable).toBe(false);
  });
});
