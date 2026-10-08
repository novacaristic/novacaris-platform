export interface HealthDimension {
  key: string;
  weight: number;
  value: number | null;
}

export function calculateHealth(
  dimensions: HealthDimension[],
): { score: number | null; status: "healthy" | "watch" | "at_risk" | "unknown"; missing: string[] } {
  const missing = dimensions
    .filter((dimension) => dimension.value === null)
    .map((dimension) => dimension.key);

  if (dimensions.length === 0 || missing.length > 0) {
    return { score: null, status: "unknown", missing };
  }

  if (
    dimensions.some(
      (dimension) =>
        !Number.isFinite(dimension.value) ||
        (dimension.value as number) < 0 ||
        (dimension.value as number) > 100 ||
        !Number.isFinite(dimension.weight) ||
        dimension.weight < 0,
    )
  ) {
    return { score: null, status: "unknown", missing: ["INVALID_HEALTH_INPUT"] };
  }

  const totalWeight = dimensions.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    return { score: null, status: "unknown", missing: ["INVALID_HEALTH_WEIGHTS"] };
  }

  const weighted = dimensions.reduce(
    (sum, item) => sum + (item.value as number) * item.weight,
    0,
  );
  const score = Math.round((weighted / totalWeight) * 100) / 100;

  return {
    score,
    status: score >= 80 ? "healthy" : score >= 55 ? "watch" : "at_risk",
    missing: [],
  };
}

export interface RenewalDependencies {
  recordEvent(type: string, details: Record<string, unknown>): Promise<void>;
  verifyCommercialAuthority(accountId: string): Promise<boolean>;
  createSalesOpportunity(accountId: string, kind: "renewal" | "expansion"): Promise<string>;
}

export async function prepareRenewal(
  deps: RenewalDependencies,
  accountId: string,
  kind: "renewal" | "expansion",
): Promise<{ prepared: boolean; opportunityId?: string; reason?: string }> {
  if (!accountId) {
    return { prepared: false, reason: "ACCOUNT_REQUIRED" };
  }

  if (!(await deps.verifyCommercialAuthority(accountId))) {
    await deps.recordEvent("customer_success.commercial_handoff.blocked", {
      accountId,
      kind,
      reason: "COMMERCIAL_AUTHORITY_REQUIRED",
    });
    return { prepared: false, reason: "COMMERCIAL_AUTHORITY_REQUIRED" };
  }

  const opportunityId = await deps.createSalesOpportunity(accountId, kind);

  await deps.recordEvent("customer_success.commercial_handoff.created", {
    accountId,
    kind,
    opportunityId,
  });

  return { prepared: true, opportunityId };
}
