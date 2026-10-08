import { describe, expect, it } from "vitest";
import {
  assertTenantContext,
  activateTenant,
  suspendTenant,
} from "../src/tenant-control";

describe("Build 25 tenant control", () => {
  it("requires tenant and organization context", () => {
    expect(() =>
      assertTenantContext({
        tenantId: "",
        organizationId: "org-1",
        status: "active",
      }),
    ).toThrow("TENANT_CONTEXT_REQUIRED");
  });

  it("activates a provisioning tenant", async () => {
    let provisioned = false;
    let event = "";

    await activateTenant(
      {
        recordEvent: async (type) => {
          event = type;
        },
        provisionServices: async () => {
          provisioned = true;
        },
        suspendServices: async () => {},
      },
      {
        tenantId: "tenant-1",
        organizationId: "org-1",
        status: "provisioning",
      },
    );

    expect(provisioned).toBe(true);
    expect(event).toBe("tenant.activated");
  });

  it("suspends active tenants without destroying context", async () => {
    let suspended = false;
    let event = "";

    await suspendTenant(
      {
        recordEvent: async (type) => {
          event = type;
        },
        provisionServices: async () => {},
        suspendServices: async () => {
          suspended = true;
        },
      },
      {
        tenantId: "tenant-1",
        organizationId: "org-1",
        status: "active",
      },
      "administrative",
    );

    expect(suspended).toBe(true);
    expect(event).toBe("tenant.suspended");
  });
});
