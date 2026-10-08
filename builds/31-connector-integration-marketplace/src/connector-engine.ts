export type ConnectorStatus =
  | "installed"
  | "configuring"
  | "active"
  | "degraded"
  | "suspended"
  | "removed";

export interface ConnectorContext {
  tenantId: string;
  connectorInstanceId: string;
  status: ConnectorStatus;
  requestedScope: string;
}

export interface ConnectorDependencies {
  scopeAuthorized(context: ConnectorContext): Promise<boolean>;
  policyAllows(context: ConnectorContext): Promise<boolean>;
  credentialReferenceValid(context: ConnectorContext): Promise<boolean>;
  invokeAdapter(context: ConnectorContext): Promise<{
    success: boolean;
    externalReference?: string;
    errorCode?: string;
  }>;
  recordEvent(type: string, details: Record<string, unknown>): Promise<void>;
}

export async function invokeConnector(
  deps: ConnectorDependencies,
  context: ConnectorContext,
): Promise<{ success: boolean; reason?: string; externalReference?: string }> {
  if (!context.tenantId || !context.connectorInstanceId) {
    return { success: false, reason: "TENANT_CONNECTOR_CONTEXT_REQUIRED" };
  }

  if (context.status !== "active") {
    return { success: false, reason: "CONNECTOR_NOT_ACTIVE" };
  }

  if (!(await deps.scopeAuthorized(context))) {
    await deps.recordEvent("connector.invocation.blocked", {
      reason: "SCOPE_DENIED",
      connectorInstanceId: context.connectorInstanceId,
    });
    return { success: false, reason: "SCOPE_DENIED" };
  }

  if (!(await deps.policyAllows(context))) {
    await deps.recordEvent("connector.invocation.blocked", {
      reason: "POLICY_DENIED",
      connectorInstanceId: context.connectorInstanceId,
    });
    return { success: false, reason: "POLICY_DENIED" };
  }

  if (!(await deps.credentialReferenceValid(context))) {
    return { success: false, reason: "CREDENTIAL_REFERENCE_INVALID" };
  }

  const result = await deps.invokeAdapter(context);

  await deps.recordEvent(
    result.success ? "connector.invocation.succeeded" : "connector.invocation.failed",
    {
      connectorInstanceId: context.connectorInstanceId,
      errorCode: result.errorCode,
      externalReference: result.externalReference,
    },
  );

  return result.success
    ? { success: true, externalReference: result.externalReference }
    : { success: false, reason: result.errorCode ?? "CONNECTOR_INVOCATION_FAILED" };
}
