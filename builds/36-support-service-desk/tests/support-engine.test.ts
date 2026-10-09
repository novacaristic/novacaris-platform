import { describe, expect, it } from "vitest";
import { closeResolvedTicket, shouldEscalate } from "../src/support-engine";

describe("Build 36 support engine", () => {
  it("does not close a ticket that is not resolved", async () => {
    const result = await closeResolvedTicket(
      {
        verifyTenantScope: async () => true,
        verifyResolution: async () => true,
        recordEvent: async () => {},
        closeTicket: async () => {},
      },
      {
        tenantId: "tenant-1",
        ticketId: "ticket-1",
        status: "in_progress",
        requiredResolutionReference: "resolution-1",
      },
    );

    expect(result.closed).toBe(false);
    expect(result.reason).toBe("TICKET_NOT_RESOLVED");
  });

  it("requires verified resolution before closure", async () => {
    const result = await closeResolvedTicket(
      {
        verifyTenantScope: async () => true,
        verifyResolution: async () => false,
        recordEvent: async () => {},
        closeTicket: async () => {},
      },
      {
        tenantId: "tenant-1",
        ticketId: "ticket-1",
        status: "resolved",
        requiredResolutionReference: "resolution-1",
      },
    );

    expect(result.closed).toBe(false);
    expect(result.reason).toBe("RESOLUTION_NOT_VERIFIED");
  });

  it("closes a resolved ticket after tenant and resolution checks pass", async () => {
    let closed = false;

    const result = await closeResolvedTicket(
      {
        verifyTenantScope: async () => true,
        verifyResolution: async () => true,
        recordEvent: async () => {},
        closeTicket: async () => {
          closed = true;
        },
      },
      {
        tenantId: "tenant-1",
        ticketId: "ticket-1",
        status: "resolved",
        requiredResolutionReference: "resolution-1",
      },
    );

    expect(result.closed).toBe(true);
    expect(closed).toBe(true);
  });

  it("escalates once the target is reached, but not twice", () => {
    expect(shouldEscalate(30, 30, false)).toBe(true);
    expect(shouldEscalate(45, 30, true)).toBe(false);
    expect(shouldEscalate(20, 30, false)).toBe(false);
  });
});
