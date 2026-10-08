export type TenantStatus =
  | "provisioning"
  | "active"
  | "suspended"
  | "deactivated";

export interface TenantContext {
  tenantId: string;
  organizationId: string;
  status: TenantStatus;
  userId?: string;
}

export interface TenantDependencies {
  recordEvent(type: string, details: Record<string, unknown>): Promise<void>;
  provisionServices(tenantId: string): Promise<void>;
  suspendServices(tenantId: string): Promise<void>;
}

export function assertTenantContext(
  context: TenantContext,
): void {
  if (!context.tenantId || !context.organizationId) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }

  if (context.status === "deactivated") {
    throw new Error("TENANT_DEACTIVATED");
  }
}

export async function activateTenant(
  deps: TenantDependencies,
  context: TenantContext,
): Promise<void> {
  assertTenantContext(context);

  if (context.status !== "provisioning") {
    throw new Error("TENANT_NOT_IN_PROVISIONING_STATE");
  }

  await deps.provisionServices(context.tenantId);

  await deps.recordEvent("tenant.activated", {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
  });
}

export async function suspendTenant(
  deps: TenantDependencies,
  context: TenantContext,
  reason: string,
): Promise<void> {
  assertTenantContext(context);

  if (context.status !== "active") {
    throw new Error("TENANT_NOT_ACTIVE");
  }

  await deps.suspendServices(context.tenantId);

  await deps.recordEvent("tenant.suspended", {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    reason,
  });
}
