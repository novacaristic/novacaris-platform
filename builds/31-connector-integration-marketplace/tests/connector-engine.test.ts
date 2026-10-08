import { describe, expect, it } from "vitest";
import { invokeConnector } from "../src/connector-engine";

const context = {
  tenantId: "tenant-1",
  connectorInstanceId: "connector-1",
  status: "active" as const,
  requestedScope: "read.ehr.encounter",
};

describe("Build 31 connector engine", () => {
  it("blocks inactive connectors", async () => {
    const result = await invokeConnector(
      {
        scopeAuthorized: async () => true,
        policyAllows: async () => true,
        credentialReferenceValid: async () => true,
        invokeAdapter: async () => ({ success: true }),
        recordEvent: async () => {},
      },
      { ...context, status: "suspended" },
    );

    expect(result.success).toBe(false);
    expect(result.reason).toBe("CONNECTOR_NOT_ACTIVE");
  });

  it("blocks invocation when scope is denied", async () => {
    const result = await invokeConnector(
      {
        scopeAuthorized: async () => false,
        policyAllows: async () => true,
        credentialReferenceValid: async () => true,
        invokeAdapter: async () => ({ success: true }),
        recordEvent: async () => {},
      },
      context,
    );

    expect(result.success).toBe(false);
    expect(result.reason).toBe("SCOPE_DENIED");
  });

  it("invokes the adapter only after scope and policy pass", async () => {
    let invoked = false;

    const result = await invokeConnector(
      {
        scopeAuthorized: async () => true,
        policyAllows: async () => true,
        credentialReferenceValid: async () => true,
        invokeAdapter: async () => {
          invoked = true;
          return { success: true, externalReference: "ehr-req-123" };
        },
        recordEvent: async () => {},
      },
      context,
    );

    expect(invoked).toBe(true);
    expect(result.success).toBe(true);
    expect(result.externalReference).toBe("ehr-req-123");
  });

  it("blocks invocation when credential reference is invalid", async () => {
    const result = await invokeConnector(
      {
        scopeAuthorized: async () => true,
        policyAllows: async () => true,
        credentialReferenceValid: async () => false,
        invokeAdapter: async () => ({ success: true }),
        recordEvent: async () => {},
      },
      context,
    );

    expect(result.success).toBe(false);
    expect(result.reason).toBe("CREDENTIAL_REFERENCE_INVALID");
  });
});
