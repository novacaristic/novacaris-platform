import { describe, expect, it } from "vitest";
import { queueNotification } from "../src/notification-engine";

const baseRequest = {
  tenantId: "tenant-1",
  eventType: "workflow.deadline",
  category: "workflow",
  channel: "email" as const,
  recipientUserId: "user-1",
  sensitivityClass: "internal" as const,
  idempotencyKey: "notification-1",
};

describe("Build 30 notification engine", () => {
  it("queues an authorized notification", async () => {
    const result = await queueNotification(
      {
        policyAllows: async () => true,
        recipientAllowed: async () => true,
        withinQuietHours: async () => false,
        queue: async () => "notification-1",
        recordEvent: async () => {},
      },
      baseRequest,
    );

    expect(result.queued).toBe(true);
    expect(result.notificationId).toBe("notification-1");
  });

  it("blocks policy-denied notifications", async () => {
    const result = await queueNotification(
      {
        policyAllows: async () => false,
        recipientAllowed: async () => true,
        withinQuietHours: async () => false,
        queue: async () => "not-created",
        recordEvent: async () => {},
      },
      baseRequest,
    );

    expect(result.queued).toBe(false);
    expect(result.reason).toBe("POLICY_DENIED");
  });

  it("blocks unauthorized recipients", async () => {
    const result = await queueNotification(
      {
        policyAllows: async () => true,
        recipientAllowed: async () => false,
        withinQuietHours: async () => false,
        queue: async () => "not-created",
        recordEvent: async () => {},
      },
      baseRequest,
    );

    expect(result.queued).toBe(false);
    expect(result.reason).toBe("RECIPIENT_NOT_AUTHORIZED");
  });

  it("defers eligible notifications during quiet hours", async () => {
    const result = await queueNotification(
      {
        policyAllows: async () => true,
        recipientAllowed: async () => true,
        withinQuietHours: async () => true,
        queue: async () => "not-created",
        recordEvent: async () => {},
      },
      baseRequest,
    );

    expect(result.queued).toBe(false);
    expect(result.reason).toBe("QUIET_HOURS");
  });
});
