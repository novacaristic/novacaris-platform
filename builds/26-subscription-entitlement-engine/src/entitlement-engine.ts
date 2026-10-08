export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "canceled"
  | "expired";

export interface Entitlement {
  featureKey: string;
  status: "enabled" | "disabled";
  limitValue?: number;
  limitUnit?: string;
}

export interface EntitlementDependencies {
  getEntitlement(tenantId: string, featureKey: string): Promise<Entitlement | null>;
  getUsage(tenantId: string, featureKey: string): Promise<number>;
  recordUsage(event: {
    tenantId: string;
    featureKey: string;
    quantity: number;
    idempotencyKey: string;
  }): Promise<void>;
}

export async function checkEntitlement(
  deps: EntitlementDependencies,
  tenantId: string,
  featureKey: string,
  requestedQuantity = 1,
): Promise<{ allowed: boolean; reason: string }> {
  const entitlement = await deps.getEntitlement(tenantId, featureKey);

  if (!entitlement || entitlement.status !== "enabled") {
    return { allowed: false, reason: "FEATURE_NOT_ENTITLED" };
  }

  if (entitlement.limitValue !== undefined) {
    const usage = await deps.getUsage(tenantId, featureKey);

    if (usage + requestedQuantity > entitlement.limitValue) {
      return { allowed: false, reason: "USAGE_LIMIT_EXCEEDED" };
    }
  }

  return { allowed: true, reason: "ENTITLED" };
}

export async function recordEntitledUsage(
  deps: EntitlementDependencies,
  tenantId: string,
  featureKey: string,
  quantity: number,
  idempotencyKey: string,
): Promise<void> {
  const check = await checkEntitlement(
    deps,
    tenantId,
    featureKey,
    quantity,
  );

  if (!check.allowed) {
    throw new Error(check.reason);
  }

  await deps.recordUsage({
    tenantId,
    featureKey,
    quantity,
    idempotencyKey,
  });
}
