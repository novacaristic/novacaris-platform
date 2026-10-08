export type NotificationChannel = "in_app" | "email" | "sms" | "webhook";

export interface NotificationRequest {
  tenantId: string;
  eventType: string;
  category: string;
  channel: NotificationChannel;
  recipientUserId?: string;
  recipientReference?: string;
  sensitivityClass: "public" | "internal" | "confidential" | "sensitive" | "restricted";
  idempotencyKey: string;
}

export interface NotificationDependencies {
  policyAllows(request: NotificationRequest): Promise<boolean>;
  recipientAllowed(request: NotificationRequest): Promise<boolean>;
  withinQuietHours(request: NotificationRequest): Promise<boolean>;
  queue(request: NotificationRequest): Promise<string>;
  recordEvent(type: string, details: Record<string, unknown>): Promise<void>;
}

export async function queueNotification(
  deps: NotificationDependencies,
  request: NotificationRequest,
): Promise<{ queued: boolean; notificationId?: string; reason?: string }> {
  if (!request.tenantId) {
    return { queued: false, reason: "TENANT_CONTEXT_REQUIRED" };
  }

  const policyAllowed = await deps.policyAllows(request);

  if (!policyAllowed) {
    await deps.recordEvent("notification.blocked", {
      reason: "POLICY_DENIED",
      eventType: request.eventType,
    });
    return { queued: false, reason: "POLICY_DENIED" };
  }

  const recipientAllowed = await deps.recipientAllowed(request);

  if (!recipientAllowed) {
    await deps.recordEvent("notification.blocked", {
      reason: "RECIPIENT_NOT_AUTHORIZED",
      eventType: request.eventType,
    });
    return { queued: false, reason: "RECIPIENT_NOT_AUTHORIZED" };
  }

  const quietHours = await deps.withinQuietHours(request);

  if (quietHours) {
    await deps.recordEvent("notification.deferred", {
      reason: "QUIET_HOURS",
      eventType: request.eventType,
    });
    return { queued: false, reason: "QUIET_HOURS" };
  }

  const notificationId = await deps.queue(request);

  await deps.recordEvent("notification.queued", {
    notificationId,
    eventType: request.eventType,
    channel: request.channel,
  });

  return { queued: true, notificationId };
}
